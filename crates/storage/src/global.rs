use std::path::{Path, PathBuf};

pub const VAULT_CONFIG_FILENAME: &str = "global.json";
const DEV_BUNDLE_ID: &str = "com.hyprnote.dev";
const STAGING_BUNDLE_ID: &str = "com.hyprnote.staging";
const NIGHTLY_BUNDLE_ID: &str = "com.hyprnote.nightly";
const LOCAL_AI_BUNDLE_ID: &str = "so.anarlog.local-ai";
const RELEASE_APP_FOLDER: &str = "anarlog";
const LEGACY_RELEASE_APP_FOLDER: &str = "hyprnote";

pub fn compute_vault_config_path(base: &Path) -> PathBuf {
    base.join(VAULT_CONFIG_FILENAME)
}

pub fn compute_default_base(bundle_id: &str) -> Option<PathBuf> {
    let data_dir = dirs::data_dir()?;
    let app_folder = resolve_app_folder(&data_dir, bundle_id, cfg!(debug_assertions));
    Some(data_dir.join(app_folder))
}

// This base holds settings, the store, and the vault config. Nightly keeps its
// own; the desktop app maps only the database itself onto stable's folder.
fn resolve_app_folder<'a>(data_dir: &Path, bundle_id: &'a str, is_debug: bool) -> &'a str {
    if is_debug
        || matches!(
            bundle_id,
            DEV_BUNDLE_ID | STAGING_BUNDLE_ID | NIGHTLY_BUNDLE_ID | LOCAL_AI_BUNDLE_ID
        )
    {
        bundle_id
    } else if has_app_data(&data_dir.join(LEGACY_RELEASE_APP_FOLDER))
        && !has_app_data(&data_dir.join(RELEASE_APP_FOLDER))
    {
        LEGACY_RELEASE_APP_FOLDER
    } else {
        RELEASE_APP_FOLDER
    }
}

fn has_app_data(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or_else(|_| path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn local_ai_build_never_reuses_existing_release_storage() {
        let temp = tempdir().unwrap();
        for folder in [RELEASE_APP_FOLDER, LEGACY_RELEASE_APP_FOLDER] {
            std::fs::create_dir(temp.path().join(folder)).unwrap();
            std::fs::write(temp.path().join(folder).join("app.db"), "original notes").unwrap();
        }

        let local_folder = resolve_app_folder(temp.path(), LOCAL_AI_BUNDLE_ID, false);
        assert_ne!(local_folder, RELEASE_APP_FOLDER);
        assert_ne!(local_folder, LEGACY_RELEASE_APP_FOLDER);
        assert!(!temp.path().join(local_folder).join("app.db").exists());
        assert_eq!(
            std::fs::read_to_string(temp.path().join(RELEASE_APP_FOLDER).join("app.db")).unwrap(),
            "original notes"
        );
    }

    #[test]
    fn resolve_app_folder_uses_anarlog_for_new_stable_installs() {
        let temp = tempdir().unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn resolve_app_folder_keeps_legacy_stable_folder_when_it_has_data() {
        let temp = tempdir().unwrap();
        let legacy_base = temp.path().join(LEGACY_RELEASE_APP_FOLDER);
        std::fs::create_dir_all(&legacy_base).unwrap();
        std::fs::write(legacy_base.join("store.json"), "{}").unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            LEGACY_RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn resolve_app_folder_prefers_anarlog_when_new_folder_has_data() {
        let temp = tempdir().unwrap();
        let legacy_base = temp.path().join(LEGACY_RELEASE_APP_FOLDER);
        let new_base = temp.path().join(RELEASE_APP_FOLDER);
        std::fs::create_dir_all(&legacy_base).unwrap();
        std::fs::create_dir_all(&new_base).unwrap();
        std::fs::write(legacy_base.join("store.json"), "{}").unwrap();
        std::fs::write(new_base.join("app.db"), "").unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn resolve_app_folder_ignores_empty_legacy_stable_folder() {
        let temp = tempdir().unwrap();
        std::fs::create_dir_all(temp.path().join(LEGACY_RELEASE_APP_FOLDER)).unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn nightly_keeps_its_own_settings_base() {
        let temp = tempfile::tempdir().unwrap();
        for folder in [RELEASE_APP_FOLDER, LEGACY_RELEASE_APP_FOLDER] {
            std::fs::create_dir(temp.path().join(folder)).unwrap();
            std::fs::write(temp.path().join(folder).join("app.db"), "stable data").unwrap();
        }
        assert_eq!(
            resolve_app_folder(temp.path(), NIGHTLY_BUNDLE_ID, false),
            NIGHTLY_BUNDLE_ID
        );
    }

    #[test]
    fn development_builds_keep_isolated_storage() {
        for (identifier, is_debug) in [("com.hyprnote.stable", true), ("com.hyprnote.dev", false)] {
            assert_eq!(
                resolve_app_folder(Path::new("/tmp"), identifier, is_debug),
                identifier
            );
        }
    }
}
