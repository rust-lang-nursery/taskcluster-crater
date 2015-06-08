extern crate rustc_serialize;
extern crate crater_msgbus;

#[derive(RustcEncodable, RustcDecodable)]
pub struct Config {
    msgbus_config: crater_msgbus::Config
}

pub fn initialize(config: Config) -> Result<Engine, Error> {
    let msgbus = try!(crater_msgbus::connect(config.msgbus_config));

    Ok(Engine {
        msgbus: msgbus
    })
}

pub struct Engine {
    msgbus: crater_msgbus::MsgBus
}

impl Engine {
    pub fn run(self) -> Result<(), Error> {
        Ok(())
    }
}

#[derive(Debug)]
pub enum Error {
    MsgBusError(crater_msgbus::Error)
}

impl From<crater_msgbus::Error> for Error {
    fn from(e: crater_msgbus::Error) -> Error {
        Error::MsgBusError(e)
    }
}
