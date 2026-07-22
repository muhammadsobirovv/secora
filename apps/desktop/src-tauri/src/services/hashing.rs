//! SHA-256 file hashing (Evidence Library duplicate detection) and a
//! small extension -> MIME-type table used when importing evidence, kept
//! dependency-free rather than pulling in `mime_guess`/`infer` for a
//! handful of pentest-relevant extensions.

use sha2::{Digest, Sha256};
use std::path::Path;

use crate::error::{AppError, AppResult};

pub async fn sha256_file(path: &Path) -> AppResult<String> {
    let bytes = tokio::fs::read(path).await.map_err(AppError::from)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn guess_mime_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" | "log" => "text/plain",
        "md" | "markdown" => "text/markdown",
        "json" => "application/json",
        "html" | "htm" => "text/html",
        "xml" => "application/xml",
        "csv" => "text/csv",
        "zip" => "application/zip",
        "pcap" | "pcapng" => "application/vnd.tcpdump.pcap",
        "har" => "application/json",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "mp4" => "video/mp4",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_common_evidence_types() {
        assert_eq!(guess_mime_type(Path::new("screenshot.PNG")), Some("image/png")); // case-insensitive
        assert_eq!(guess_mime_type(Path::new("capture.pcapng")), Some("application/vnd.tcpdump.pcap"));
        assert_eq!(guess_mime_type(Path::new("notes.md")), Some("text/markdown"));
        assert_eq!(guess_mime_type(Path::new("burp-export.har")), Some("application/json"));
    }

    #[test]
    fn unknown_extension_and_no_extension_return_none() {
        assert_eq!(guess_mime_type(Path::new("archive.rar")), None);
        assert_eq!(guess_mime_type(Path::new("no_extension")), None);
    }

    #[tokio::test]
    async fn sha256_file_matches_known_test_vector() {
        let dir = std::env::temp_dir().join(format!("phai-hashing-test-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let file_path = dir.join("hello.txt");
        tokio::fs::write(&file_path, b"hello world").await.unwrap();

        // Well-known SHA-256("hello world")
        let expected = "b94d27b9934d3e08a52e52d7da7dacefbd51e75c04b3fdc4c9c5e0e6c3fbca4";
        let actual = sha256_file(&file_path).await.unwrap();
        assert_eq!(actual, expected);

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
}
