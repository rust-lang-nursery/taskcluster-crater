extern crate hyper;
extern crate rustc_serialize;
#[macro_use]
extern crate log;
extern crate env_logger;
extern crate crater_api as api;

use rustc_serialize::json;
use std::convert::From;
use std::env;
use std::error::Error as StdError;
use std::fmt::{self, Display, Formatter};
use std::fs::File;
use std::io::{self, Read};
use api::v1;

enum Opts {
    CustomBuild { url: String, sha: String },
    CrateBuild { toolchain: String },
    Report { kind: v1::ReportKind }
}

#[derive(RustcEncodable, RustcDecodable)]
pub struct Config {
    server_url: String,
    username: String,
    auth_token: String
}

fn main() {
    run().unwrap();
}

fn run() -> Result<(), Error> {
    try!(env_logger::init());

    let config = try!(load_config());

    let ref args: Vec<String> = env::args().collect();
    let opts = try!(parse_opts(args));

    try!(run_run(config, opts));

    Ok(())
}

fn load_config() -> Result<Config, Error> {
    let mut path = try!(::std::env::current_dir());
    path.push("crater-cli-config.json");

    let mut file = try!(File::open(path));

    let mut s = String::new();
    try!(file.read_to_string(&mut s));

    return Ok(try!(json::decode(&s)));
}

fn parse_opts(args: &[String]) -> Result<Opts, Error> {
    if args.len() < 2 { return Err(Error::OptParse) }

    if args[1] == "custom-build" {
        let url = try!(args.get(2).ok_or(Error::OptParse));
        let sha = try!(args.get(3).ok_or(Error::OptParse));
        Ok(Opts::CustomBuild { url: url.clone(), sha: sha.clone() })
    } else if args[1] == "crate-build" {
        let toolchain = try!(args.get(2).ok_or(Error::OptParse));
        Ok(Opts::CrateBuild { toolchain: toolchain.clone() })
    } else if args[1] == "report" {
        let ref kind = try!(args.get(2).ok_or(Error::OptParse));
        let kind = try!(parse_report_kind(kind, &args[3..]));
        Ok(Opts::Report { kind: kind })
    } else {
        Err(Error::OptParse)
    }
}

fn parse_report_kind(kind: &str, args: &[String]) -> Result<v1::ReportKind, Error> {
    if kind == "comparison" {
        let from = try!(args.get(0).ok_or(Error::OptParse));
        let to = try!(args.get(1).ok_or(Error::OptParse));
        Ok(v1::ReportKind::Comparison { toolchain_from: from.clone(),
                                        toolchain_to: to.clone() })
    } else {
        Err(Error::OptParse)
    }
}

fn run_run(config: Config, opts: Opts) -> Result<(), Error> {
    let client_v1 = client_v1::Ctxt::new(config);
    match opts {
        Opts::CustomBuild { url, sha } => {
            println!("{}", try!(client_v1.custom_build(url, sha)));
        }
        Opts::CrateBuild { toolchain } => {
            println!("{}", try!(client_v1.crate_build(toolchain)));
        }
        Opts::Report { kind } => {
            println!("{}", try!(client_v1.report(kind)));
        }
    }

    Ok(())
}

#[derive(Debug)]
enum Error {
    OptParse,
    StdError(Box<StdError + Send>),
}

impl StdError for Error {
    fn description(&self) -> &str {
        match *self {
            Error::OptParse => "bad arguments",
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


impl From<io::Error> for Error {
    fn from(e: io::Error) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<json::DecoderError> for Error {
    fn from(e: json::DecoderError) -> Error {
        Error::StdError(Box::new(e))
    }
}

impl From<json::EncoderError> for Error {
    fn from(e: json::EncoderError) -> Error {
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

impl From<v1::StdIoResponse> for Error {
    fn from(e: v1::StdIoResponse) -> Error {
        Error::StdError(Box::new(e))
    }
}

mod client_v1 {
    use super::{Config, Error};
    use hyper::Client;
    use api::v1;
    use rustc_serialize::json;
    use std::io::Read;

    pub struct Ctxt {
        config: Config
    }

    impl Ctxt {
        pub fn new(config: Config) -> Ctxt {
            Ctxt { config: config }
        }

        /// Returns the stdout from `node schedule-tasks.js custom-build`
        pub fn custom_build(&self, url: String, sha: String) -> Result<String, Error> {
            let ref url = format!("{}/api/v1/custom_build", self.config.server_url);
            info!("api endpoint: {}", url);
            let ref req = v1::CustomBuildRequest {
                url: url.clone(), sha: sha
            };
            let ref req_str = try!(json::encode(req));

            let mut client = Client::new();
            let mut http_res = try!(client.post(url).body(req_str).send());
            let ref mut res_str = String::new();
            try!(http_res.read_to_string(res_str));

            let res: v1::StdIoResponse = try!(json::decode(res_str));
            let stdout = try!(Result::from(res));

            Ok(stdout)
        }

        pub fn crate_build(&self, toolchain: String) -> Result<String, Error> {
            unimplemented!()
        }

        pub fn report(&self, kind: v1::ReportKind) -> Result<String, Error> {
            unimplemented!()
        }
    }

}
