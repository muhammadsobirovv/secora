//! Folder Watch — watches a directory for new files and auto-imports them
//! into the Evidence Library (e.g. point it at a Burp Suite export
//! folder or a screenshot tool's save directory). One watcher per
//! `(project_id, folder)` pair, tracked in `FileWatcherService` so
//! Settings > File Manager can list/stop active watches.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

pub type ImportCallback = Arc<dyn Fn(String, PathBuf) + Send + Sync>;

struct ActiveWatch {
    _watcher: RecommendedWatcher, // held only to keep the OS watch alive; dropped on stop_watch
    project_id: String,
    folder: PathBuf,
}

pub struct FileWatcherService {
    watches: Mutex<HashMap<String, ActiveWatch>>,
    on_new_file: ImportCallback,
}

impl FileWatcherService {
    pub fn new(on_new_file: ImportCallback) -> Self {
        Self { watches: Mutex::new(HashMap::new()), on_new_file }
    }

    pub async fn start_watch(&self, project_id: &str, folder: &std::path::Path) -> AppResult<()> {
        if !folder.is_dir() {
            return Err(AppError::new("INVALID_FOLDER", format!("\"{}\" is not a directory.", folder.display())));
        }

        let project_id_owned = project_id.to_string();
        let callback = self.on_new_file.clone();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Event>();

        // `notify`'s watcher callback runs on its own OS thread and is
        // synchronous — bridge into async-land with an unbounded channel
        // rather than trying to `block_on` inside the callback.
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        })
        .map_err(|e| AppError::new("WATCHER_ERROR", e.to_string()))?;

        watcher
            .watch(folder, RecursiveMode::NonRecursive)
            .map_err(|e| AppError::new("WATCHER_ERROR", e.to_string()))?;

        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if matches!(event.kind, EventKind::Create(_)) {
                    for path in event.paths {
                        if path.is_file() {
                            callback(project_id_owned.clone(), path);
                        }
                    }
                }
            }
        });

        let mut watches = self.watches.lock().await;
        watches.insert(
            watch_key(project_id, folder),
            ActiveWatch { _watcher: watcher, project_id: project_id.to_string(), folder: folder.to_path_buf() },
        );
        Ok(())
    }

    pub async fn stop_watch(&self, project_id: &str, folder: &std::path::Path) -> AppResult<()> {
        let mut watches = self.watches.lock().await;
        watches.remove(&watch_key(project_id, folder));
        Ok(())
    }

    pub async fn list_watches(&self, project_id: &str) -> Vec<String> {
        let watches = self.watches.lock().await;
        watches
            .values()
            .filter(|w| w.project_id == project_id)
            .map(|w| w.folder.to_string_lossy().to_string())
            .collect()
    }
}

fn watch_key(project_id: &str, folder: &std::path::Path) -> String {
    format!("{project_id}::{}", folder.to_string_lossy())
}
