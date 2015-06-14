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
    db: db::Config,
    engine: engine::Config
}

fn main() {
    run().unwrap();
}

fn run() -> Result<(), Error> {
    try!(env_logger::init());

    let config = try!(load_config());

    // Start the job engine that listens to the pulse server, creates
    // taskcluster tasks, and updates the database with results.
    try!(start_engine(config.engine));

    // Blocks until the process is killed
    run_web_server(config.db)
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

fn run_web_server(db_config: db::Config) -> Result<(), Error> {
    let static_router = static_router();
    let api_router_v1 = api_router_v1(db_config);

    let mut mount = Mount::new();
    mount.mount("/api/v1/", api_router_v1);
    mount.mount("/", static_router);

    let _ = try!(Iron::new(mount).http("localhost:3000"));

    return Ok(());
}

fn api_router_v1(db_config: db::Config) -> Router {
    let api_ctxt_master = Arc::new(api_v1::Ctxt::new(db_config));
    let mut router = Router::new();

    let api_ctxt = api_ctxt_master.clone();
    router.get("/custom_build/", move |r: &mut Request| {
        let mut body = String::new();
        try!(r.body.read_to_string(&mut body).map_err(|e| Error::from(e)));
        let payload = try!(api_ctxt.custom_build(&body));
        Ok(Response::with((status::Ok, payload)).set(known_mime_type("application/json")))
    });
    let api_ctxt = api_ctxt_master.clone();
    router.get("/self_test", move |r: &mut Request| {
        let payload = try!(api_ctxt.self_test());
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
}

impl StdError for Error {
    fn description(&self) -> &str {
        match *self {
            Error::BadMimeType => "bad mime type",
            Error::StdError(ref e) => e.description(),
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

mod api_v1 {
    use super::Error;
    use db;
    use rustc_serialize::json;

    pub struct Ctxt {
        db_config: db::Config
    }

    impl Ctxt {
        pub fn new(db_config: db::Config) -> Ctxt {
            Ctxt { db_config: db_config }
        }

        pub fn custom_build(&self, req: &str) -> Result<String, Error> {
            unimplemented!()
        }

        pub fn self_test(&self) -> Result<String, Error> {
            info!("self test");

            #[derive(RustcEncodable, RustcDecodable)]
            struct SelfTest;

            Ok(try!(json::encode(&SelfTest)))
        }
    }
}

