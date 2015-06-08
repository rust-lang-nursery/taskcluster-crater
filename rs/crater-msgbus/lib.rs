extern crate rustc_serialize;

#[derive(RustcEncodable, RustcDecodable)]
pub struct Config;

pub fn connect(config: Config) -> Result<MsgBus, Error> {
    Ok(MsgBus)
}

pub struct MsgBus;

#[derive(Debug)]
pub enum Error { }
