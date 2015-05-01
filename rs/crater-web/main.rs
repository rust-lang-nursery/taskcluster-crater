extern crate iron;
extern crate router;
extern crate mount;
#[macro_use]
extern crate log;
extern crate env_logger;

use std::error::Error as StdError;
use std::fmt::{Display, Formatter};
use std::fmt::Error as FmtError;
use std::convert::From;
use std::io::Error as IoError;
use iron::prelude::*;
use iron::status;
use router::Router;
use mount::Mount;

fn main() {
    env_logger::init().unwrap();

    let static_router = static_router();
    let api_router = api_router();

    let mut mount = Mount::new();
    mount.mount("/api/v1/", api_router);
    mount.mount("/", static_router);

    Iron::new(mount).http("localhost:3000").unwrap();
}

fn static_router() -> Router {
    let mut router = Router::new();
    router.get("/*", move |r: &mut Request| {
        let last = r.url.path.last().expect("path is supposed to be non-empty");
        let filename = if last == "" {
            String::from("index.html")
        } else {
            last.clone()
        };

        let payload = try!(get_static_file(&filename));
        
        Ok(Response::with((status::Ok, payload)))
    });

    return router;
}

fn api_router() -> Router {
    let mut router = Router::new();
    router.get("/stuff", move |_: &mut Request| {
        println!("test2");

        Ok(Response::with(status::Ok))
    });

    return router;
}

/// Loads a file from the './static' directory
fn get_static_file(name: &str) -> Result<String, Error> {
    use std::fs::File;
    use std::io::Read;

    let mut path = try!(::std::env::current_dir());

    let asset_dir = "static";
    
    path.push(asset_dir);
    path.push(name);

    let mut file = try!(File::open(path));

    let mut s = String::new();
    try!(file.read_to_string(&mut s));

    return Ok(s);
}

#[derive(Debug)]
pub enum Error {
    FileNotFound
}

impl StdError for Error {
    fn description(&self) -> &str {
        match *self {
            Error::FileNotFound => "file not found"
        }
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut Formatter) -> Result<(), FmtError> {
        f.write_str(self.description())
    }
}

impl From<Error> for IronError {
    fn from(e: Error) -> IronError {
        IronError::new(e, status::NotFound)
    }
}

impl From<IoError> for Error {
    fn from(_: IoError) -> Error {
        Error::FileNotFound
    }
}
