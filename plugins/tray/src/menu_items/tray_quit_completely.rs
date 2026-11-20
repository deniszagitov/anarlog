use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

use super::MenuItemHandler;

pub struct TrayQuitCompletely;

impl MenuItemHandler for TrayQuitCompletely {
    const ID: &'static str = "anlg_tray_quit_completely";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(
            app,
            Self::ID,
            crate::locale::tr("Quit Completely…"),
            true,
            None::<&str>,
        )?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let app_name = app.package_info().name.clone();
        let app = app.clone();

        app.dialog()
            .message(crate::locale::message(
                "{app} will stop running in the background.",
                &[("app", &app_name)],
            ))
            .title(crate::locale::message(
                "Quit {app} Completely?",
                &[("app", &app_name)],
            ))
            .buttons(MessageDialogButtons::OkCancelCustom(
                crate::locale::tr("Quit Completely"),
                crate::locale::tr("Cancel"),
            ))
            .show(move |confirmed| {
                if confirmed {
                    quit_completely(&app);
                }
            });
    }
}

pub fn quit_completely(app: &AppHandle<tauri::Wry>) {
    // A confirmed quit skips the full frontend exit flush and only saves local edits.
    anlg_intercept::set_force_quit();
    app.exit(0);
}
