#![feature(vec_push_all)]

extern crate iron;
extern crate hyper;
extern crate router;
extern crate mount;
#[macro_use]
extern crate log;
extern crate env_logger;
extern crate crater_db as db;
extern crate rustc_serialize;
extern crate crater_engine as engine;
extern crate crater_api as api;

use iron::mime::Mime;
use iron::prelude::*;
use iron::status;
use mount::Mount;
use router::Router;
use rustc_serialize::json;
use std::convert::From;
use std::error::Error as StdError;
use std::fmt::{self, Display, Formatter};
use std::fs::File;
use std::io::{self, Read};
use std::sync::Arc;
use std::thread;

#[derive(RustcEncodable, RustcDecodable)]
struct Config {
    host: String,
    port: u16,
    db: db::Config,
    engine: engine::Config,
    users: Vec<(String, String)>
}

fn main() {
    run().unwrap();
}

fn run() -> Result<(), Error> {
    try!(env_logger::init());

    let config = try!(load_config());

    // Start the job engine that listens to the pulse server, creates
    // taskcluster tasks, and updates the database with results.
    try!(start_engine(config.engine.clone()));

    // Blocks until the process is killed
    run_web_server(&config)
}

fn load_config() -> Result<Config, Error> {
    let mut path = try!(::std::env::current_dir());
    path.push("crater-web-config.json");

    let mut file = try!(File::open(path));

    let mut s = String::new();
    try!(file.read_to_string(&mut s));

    return Ok(try!(json::decode(&s)));
}

fn start_engine(engine_config: engine::Config) -> Result<(), Error> {

    let engine = try!(engine::initialize(engine_config));

    thread::spawn(|| {
        // FIXME: error handling
        engine.run().unwrap();
    });

    Ok(())
}

fn run_web_server(config: &Config) -> Result<(), Error> {
    let static_router = static_router();
    let api_router_v1 = api_router_v1(config.users.clone());

    let mut mount = Mount::new();
    mount.mount("/api/v1/", api_router_v1);
    mount.mount("/", static_router);

    let addr = format!("{}:{}", config.host, config.port);
    let _ = try!(Iron::new(mount).http(&*addr));

    return Ok(());
}

fn api_router_v1(users: Vec<(String, String)>) -> Router {
    let api_ctxt_master = Arc::new(api_v1::Ctxt::new(users));
    let mut router = Router::new();

    let api_ctxt = api_ctxt_master.clone();
    router.post("/custom_build", move |r: &mut Request| {
        let mut body = String::new();
        try!(r.body.read_to_string(&mut body).map_err(|e| Error::from(e)));
        let payload = try!(api_ctxt.custom_build(&body));
        Ok(Response::with((status::Ok, payload)).set(known_mime_type("application/json")))
    });
    let api_ctxt = api_ctxt_master.clone();
    router.post("/crate_build", move |r: &mut Request| {
        let mut body = String::new();
        try!(r.body.read_to_string(&mut body).map_err(|e| Error::from(e)));
        let payload = try!(api_ctxt.crate_build(&body));
        Ok(Response::with((status::Ok, payload)).set(known_mime_type("application/json")))
    });
    let api_ctxt = api_ctxt_master.clone();
    router.post("/report", move |r: &mut Request| {
        let mut body = String::new();
        try!(r.body.read_to_string(&mut body).map_err(|e| Error::from(e)));
        let payload = try!(api_ctxt.report(&body));
        Ok(Response::with((status::Ok, payload)).set(known_mime_type("application/json")))
    });
    let api_ctxt = api_ctxt_master.clone();
    router.post("/self-test", move |r: &mut Request| {
        let mut body = String::new();
        try!(r.body.read_to_string(&mut body).map_err(|e| Error::from(e)));
        let payload = try!(api_ctxt.self_test(&body));
        Ok(Response::with((status::Ok, payload)).set(known_mime_type("application/json")))
    });

    return router;
}

fn static_router() -> Router {
    let mut router = Router::new();
    router.get("/", move |_: &mut Request| {
        let (payload, mime_type) = try!(get_static_file_and_mime_type("index.html"));
        Ok(Response::with((status::Ok, payload)).set(mime_type))
    });
    router.get("*", move |r: &mut Request| {
        let last = r.url.path.last().expect("path is supposed to be non-empty");
        let filename = if last == "" {
            String::from("index.html")
        } else {
            last.clone()
        };

        let (payload, mime_type) = try!(get_static_file_and_mime_type(&filename));
        
        Ok(Response::with((status::Ok, payload)).set(mime_type))
    });

    return router;
}

fn get_static_file_and_mime_type(name: &str) -> Result<(String, Mime), Error> {
    let payload = try!(get_static_file(&name));
    let mime_type = known_mime_type(try!(get_mime_type(&name)));

    return Ok((payload, mime_type));
}

fn known_mime_type(mime_type: &str) -> Mime {
    mime_type.parse().ok().expect("shouldn't create mime types that don't parse")
}

/// Loads a file from the './static' directory
fn get_static_file(name: &str) -> Result<String, Error> {
    let mut path = try!(::std::env::current_dir());

    let asset_dir = "static";
    
    path.push(asset_dir);
    path.push(name);

    let mut file = try!(File::open(path));

    let mut s = String::new();
    try!(file.read_to_string(&mut s));

    return Ok(s);
}

fn get_mime_type(name: &str) -> Result<&'static str, Error> {
    if name.ends_with(".html") {
        Ok("text/html")
    } else if name.ends_with(".js") {
        Ok("application/x-javascript")
    } else if name.ends_with(".css") {
        Ok("text/css")
    } else {
        Err(Error::BadMimeType)
    }
}

#[derive(Debug)]
pub enum Error {
    BadMimeType,
    StdError(Box<StdError + Send>),
    AuthError
}

impl StdError for Error {
    fn description(&self) -> &str {
        match *self {
            Error::BadMimeType => "bad mime type",
            Error::StdError(ref e) => e.description(),
            Error::AuthError => "authentication failure"
        }
    }

    fn cause(&self) -> Option<&StdError> {
        match *self {
            Error::StdError(ref e) => Some(&**e),
            _ => None
        }
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut Formatter) -> Result<(), fmt::Error> {
        f.write_str(self.description())
    }
}

impl From<Error> for IronError {
    fn from(e: Error) -> IronError {
        // FIXME
        IronError::new(e, status::InternalServerError)
    }
}

impl From<io::Error> for Error {
    fn from(e: io::Error) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<json::EncoderError> for Error {
    fn from(e: json::EncoderError) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<json::DecoderError> for Error {
    fn from(e: json::DecoderError) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<hyper::Error> for Error {
    fn from(e: hyper::Error) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<log::SetLoggerError> for Error {
    fn from(e: log::SetLoggerError) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<engine::Error> for Error {
    fn from(e: engine::Error) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<std::string::FromUtf8Error> for Error {
    fn from(e: std::string::FromUtf8Error) -> Error {
        Error::StdError(Box::new(e))
    }
}

mod api_v1 {
    use super::Error;
    use rustc_serialize::json;
    use api::v1;

    pub struct Ctxt {
        users: Vec<(String, String)>
    }

    impl Ctxt {
        pub fn new(users: Vec<(String, String)>) -> Ctxt {
            Ctxt { users: users }
        }

        pub fn custom_build(&self, req: &str) -> Result<String, Error> {
            let ref req: v1::CustomBuildRequest = try!(json::decode(req));

            info!("custom_build: {:?}", req);

            try!(self.authorize(&req.auth));

            let script = "schedule-tasks.js";
            let ref args = ["custom-build", &*req.repo_url, &*req.commit_sha];
            let res = try!(node_exec(script, args));
            Ok(res)
        }

        pub fn crate_build(&self, req: &str) -> Result<String, Error> {
            let ref req: v1::CrateBuildRequest = try!(json::decode(req));

            info!("crate_build: {:?}", req);

            try!(self.authorize(&req.auth));

            let script = "schedule-tasks.js";
            let ref args = ["crate-build", &*req.toolchain, "--most-recent-only"];
            let res = try!(node_exec(script, args));
            Ok(res)
        }

        pub fn report(&self, req: &str) -> Result<String, Error> {
            let ref req: v1::ReportRequest = try!(json::decode(req));

            info!("report: {:?}", req);

            try!(self.authorize(&req.auth));

            let script = "print-report.js";
            let res = match req.kind {
                v1::ReportKind::Comparison {
                    ref toolchain_from, ref toolchain_to
                } => {
                    let ref args = ["comparison", &**toolchain_from, &**toolchain_to];
                    try!(node_exec(script, args))
                }
                v1::ReportKind::Toolchain(ref t) => {
                    let ref args = ["toolchain", &**t];
                    try!(node_exec(script, args))
                }
            };
            Ok(res)
        }

        pub fn self_test(&self, req: &str) -> Result<String, Error> {
            let ref req: v1::SelfTestRequest = try!(json::decode(req));

            info!("self-test: {:?}", req);

            try!(self.authorize(&req.auth));

            let ref res = v1::StdIoResponse {
                stdout: String::from("self-test succeeded"),
                stderr: String::from(""),
                success: true
            };

            Ok(try!(json::encode(res)))
        }

        fn authorize(&self, auth: &v1::Auth) -> Result<(), Error> {
            for &(ref name, ref token) in &self.users {
                if name == &auth.name && token == &auth.token {
                    return Ok(());
                }
            }

            Err(Error::AuthError)
        }

    }

    fn node_exec(script: &str, args: &[&str]) -> Result<String, Error> {
        use std::process::Command;

        info!("running node: {} {:?}", script, args);

        let script_slice: &[&str] = &[script];
        let ref mut real_args = Vec::from(script_slice);
        real_args.push_all(args);

        // Back up from the 'rs' directory to get to the js stuff
        let dir = "..";
        
        let output = try!(Command::new("node")
                          .args(real_args)
                          .current_dir(dir)
                          .output());

        let ref res = v1::StdIoResponse {
            stdout: try!(String::from_utf8(output.stdout)),
            stderr: try!(String::from_utf8(output.stderr)),
            success: output.status.success()
        };

        Ok(try!(json::encode(res)))
    }
}

