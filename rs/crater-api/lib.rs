extern crate rustc_serialize;

pub mod v1 {
    use std::error::Error as StdError;
    use std::fmt::{self, Display, Formatter};

    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct Auth {
        pub name: String,
        pub token: String
    }

    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct SelfTestRequest {
        pub auth: Auth
    }
    
    /// Build a compiler from a git repo and a commit sha
    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct CustomBuildRequest {
        pub auth: Auth,
        pub repo_url: String,
        pub commit_sha: String
    }
    
    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct CrateBuildRequest {
        pub auth: Auth,
        pub toolchain: String
    }

    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct ReportRequest {
        pub auth: Auth,
        pub kind: ReportKind
    }

    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub enum ReportKind {
        Comparison {
            toolchain_from: String,
            toolchain_to: String
        },
        Toolchain(String)
    }

    /// Responses from running one of the v1 nodejs scripts
    #[derive(RustcEncodable, RustcDecodable)]
    #[derive(Debug)]
    pub struct StdIoResponse {
        pub stdout: String,
        pub stderr: String,
        pub success: bool
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
            if e.success {
                Ok(e.stdout)
            } else {
                Err(e)
            }
        }
    }
}

