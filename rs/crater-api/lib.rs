extern crate rustc_serialize;

pub mod v1 {
    use std::error::Error as StdError;
    use std::fmt::{self, Display, Formatter};

    /// Build a compiler from a git repo and a commit sha
    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct CustomBuildRequest {
        pub url: String,
        pub sha: String
    }

    pub enum ReportKind {
        Comparison {
            toolchain_from: String,
            toolchain_to: String
        }
    }

    /// Responses from running one of the v1 nodejs scripts
    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct StdIoResponse {
        pub stdout: String,
        pub stderr: String,
        pub exit_code: u32
    }

    impl StdError for StdIoResponse {
        fn description(&self) -> &str { &self.stderr }
    }

    impl Display for StdIoResponse {
        fn fmt(&self, f: &mut Formatter) -> Result<(), fmt::Error> {
            f.write_str(self.description())
        }
    }

    impl From<StdIoResponse> for Result<String, StdIoResponse> {
        fn from(e: StdIoResponse) -> Result<String, StdIoResponse> {
            if e.exit_code == 0 {
                Ok(e.stdout)
            } else {
                Err(e)
            }
        }
    }
}

