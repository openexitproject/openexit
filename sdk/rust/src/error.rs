use std::fmt;

use serde_json::Value;

pub type Result<T> = std::result::Result<T, PaspError>;

#[derive(Debug)]
pub struct PaspError {
    code: String,
    message: String,
    context: Option<Value>,
    source: Option<Box<dyn std::error::Error + Send + Sync>>,
}

impl PaspError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            context: None,
            source: None,
        }
    }

    pub fn with_context(mut self, context: Value) -> Self {
        self.context = Some(context);
        self
    }

    pub fn with_source<E>(mut self, source: E) -> Self
    where
        E: std::error::Error + Send + Sync + 'static,
    {
        self.source = Some(Box::new(source));
        self
    }

    pub fn code(&self) -> &str {
        &self.code
    }
    pub fn context(&self) -> Option<&Value> {
        self.context.as_ref()
    }
}

impl fmt::Display for PaspError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for PaspError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.source.as_deref().map(|e| e as _)
    }
}
