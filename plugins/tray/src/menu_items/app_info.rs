use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_misc::MiscPluginExt;

use super::MenuItemHandler;

pub struct AppInfo;

impl MenuItemHandler for AppInfo {
    const ID: &'static str = "anlg_app_info";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let title = crate::locale::message("About {app}", &[("app", &app.package_info().name)]);
        let item = MenuItem::with_id(app, Self::ID, title, true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let app_name = app.package_info().name.clone();
        let app_version = app.package_info().version.to_string();
        let app_commit = app.misc().get_git_hash();

        let message = crate::locale::message(
            "App Name: {app}\nApp Version: {version}\nSHA: {commit}",
            &[
                ("app", &app_name),
                ("version", &app_version),
                ("commit", &app_commit),
            ],
        );

        let app_clone = app.clone();

        app.dialog()
            .message(&message)
            .title(crate::locale::message("About {app}", &[("app", &app_name)]))
            .buttons(MessageDialogButtons::OkCancelCustom(
                crate::locale::tr("Copy"),
                crate::locale::tr("Cancel"),
            ))
            .show(move |result| {
                if result {
                    let _ = app_clone.clipboard().write_text(&message);
                }
            });
    }
}
