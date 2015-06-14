extern crate rustc_serialize;

pub mod v1 {
    /// Build a compiler from a git repo and a commit sha
    #[derive(RustcEncodable, RustcDecodable)]
    pub struct CustomBuildRequest {
        pub url: String,
        pub sha: String
    }
}

