use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};

static MESSAGES: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub(crate) fn replace(messages: HashMap<String, String>) -> bool {
    let mut current = MESSAGES.lock().unwrap();
    if *current == messages {
        return false;
    }
    *current = messages;
    true
}

pub(crate) fn tr(source: &str) -> String {
    MESSAGES
        .lock()
        .unwrap()
        .get(source)
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(|| source.to_owned())
}

pub(crate) fn message(source: &str, values: &[(&str, &str)]) -> String {
    values.iter().fold(tr(source), |text, (key, value)| {
        text.replace(&format!("{{{key}}}"), value)
    })
}
