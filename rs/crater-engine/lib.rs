extern crate rustc_serialize;
extern crate crater_bus as bus;
#[macro_use]
extern crate log;

use std::error::Error as StdError;
use std::fmt::{self, Display, Formatter};

#[derive(RustcEncodable, RustcDecodable)]
#[derive(Clone)]
pub struct Config {
    bus_config: bus::Config
}

pub fn initialize(config: Config) -> Result<Engine, Error> {
    let bus = try!(bus::connect(config.bus_config));

    Ok(Engine {
        bus: bus
    })
}

pub struct Engine {
    bus: bus::Bus
}

impl Engine {
    pub fn run(self) -> Result<(), Error> {
        info!("starting crater engine");
        let listener = try!(self.bus.listen());

        loop {
            match try!(listener.recv()) {
                Some(_) => {
                }
                None => {
                    return Ok(());
                }
            }
        }
    }
}

#[derive(Debug)]
pub enum Error {
    BusError(bus::Error)
}

impl StdError for Error {
    fn description(&self) -> &str {
        "message bus error"
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut Formatter) -> Result<(), fmt::Error> {
        f.write_str(self.description())
    }
}

impl From<bus::Error> for Error {
    fn from(e: bus::Error) -> Error {
        Error::BusError(e)
    }
}
