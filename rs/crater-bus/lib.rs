extern crate rustc_serialize;

#[derive(RustcEncodable, RustcDecodable)]
pub struct Config;

pub fn connect(config: Config) -> Result<Bus, Error> {
    Ok(Bus)
}

pub struct Bus;

impl Bus {
    pub fn listen(&self) -> Result<Listener, Error> {
        Ok(Listener)
    }
}

pub struct Listener;

impl Listener {
    pub fn recv(&self) -> Result<Option<Msg>, Error> {
        Ok(None)
    }
}

pub enum Msg {
}

#[derive(Debug)]
pub enum Error { }
