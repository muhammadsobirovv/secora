//! Tauri commands exposing Local RAG to the frontend: `search_rag` blends
//! FTS5 keyword results with cosine-similarity semantic results whenever an
//! embedding-capable provider is configured (falls back to pure keyword
//! search otherwise — always works offline, per the Module 7 spec), and
//! `reindex_rag` lets Settings expose a manual "Rebuild search index"
//! action for after bulk imports/sync.

use tauri::State;

use crate::ai::providers::AiProvider;
use crate::error::AppResult;
use crate::rag::RagSearchResult;
use crate::state::AppState;

#[tauri::command]
pub async fn search_rag(
    state: State<'_, AppState>,
    query: String,
    project_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<RagSearchResult>> {
    let limit = limit.unwrap_or(20);

    let mut keyword = state
        .rag
        .search_keyword(&query, project_id.as_deref(), limit)
        .unwrap_or_default();

    // Semantic search is opportunistic: only attempt it if some provider is
    // actually configured and willing to embed. Any failure here (no
    // provider, provider doesn't support embeddings, network error for a
    // remote provider) is swallowed — keyword search alone already
    // satisfies the "must work offline" requirement.
    if let Ok((provider, credential)) = state.ai_providers.resolve(None).await {
        if let Ok(vectors) = provider.embed(&[query.clone()], &credential).await {
            if let Some(query_vector) = vectors.into_iter().next() {
                if let Ok(semantic) = state.rag.search_semantic(&query_vector, project_id.as_deref(), limit as usize) {
                    // Merge: keep keyword hits (they carry real snippets),
                    // append semantic-only hits that keyword search missed.
                    for hit in semantic {
                        let already_present = keyword
                            .iter()
                            .any(|k| k.source_type == hit.source_type && k.source_id == hit.source_id);
                        if !already_present {
                            keyword.push(hit);
                        }
                    }
                }
            }
        }
    }

    keyword.truncate(limit as usize);
    Ok(keyword)
}

/// Rebuilds the FTS5 index from scratch from the source-of-truth tables.
/// Cheap enough at desktop data volumes to run synchronously; returns the
/// number of rows indexed so the UI can show "Reindexed 1,204 items."
#[tauri::command]
pub async fn reindex_rag(state: State<'_, AppState>) -> AppResult<usize> {
    crate::rag::indexer::reindex_all(&state.db, &state.rag).await
}

/// Recomputes embeddings for everything currently in the FTS5 index, using
/// whichever provider is configured (or a caller-specified one). Separate
/// from `reindex_rag` because it costs API calls/time — the frontend should
/// only trigger this on explicit user action ("Enable semantic search"),
/// not automatically on every reindex.
#[tauri::command]
pub async fn reindex_rag_embeddings(state: State<'_, AppState>, provider: Option<String>) -> AppResult<usize> {
    let preferred = provider.as_deref().and_then(crate::ai::providers::ProviderName::from_str);
    let (provider, credential) = state.ai_providers.resolve(preferred).await?;
    crate::rag::indexer::reindex_embeddings(&state.db, &state.rag, provider.as_ref(), &credential).await
}
