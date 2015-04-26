#![cfg_attr(test, feature(std_misc))]

extern crate postgres;

use std::error::Error;

use postgres::{Connection, SslMode};

#[derive(PartialEq, Debug)]
pub struct BuildResult {
    pub toolchain: String,
    pub crate_name: String,
    pub crate_vers: String,
    pub success: bool,
    pub task_id: String
}

pub struct BuildResultKey {
    pub toolchain: String,
    pub crate_name: String,
    pub crate_vers: String
}

pub struct Database {
    conn: Connection
}

impl Database {
    /// Connects and updates the db to the correct scheme
    pub fn connect(dbname: &str,
                   username: &str,
                   password: &str,
                   host: &str,
                   port: u16) -> Result<Database, Box<Error>> {
        let url = make_url(dbname, username, password, host, port);
        let conn = try!(Connection::connect(&url[..], &SslMode::None));

        let db = Database { conn: conn };

        try!(db.create_or_upgrade_tables());

        Ok(db)
    }

    fn create_or_upgrade_tables(&self) -> Result<(), Box<Error>> {
        let q = "create table if not exists \
                 build_results ( \
                 toolchain text not null, \
                 crate_name text not null, crate_vers text not null, \
                 success boolean not null, \
                 task_id text not null, \
                 primary key ( \
                 toolchain, crate_name, crate_vers ) )";
        try!(self.conn.execute(q, &[]));

        let q = "create table if not exists \
                 custom_toolchains ( \
                 toolchain text not null, \
                 url text not null, \
                 task_id text not null, \
                 primary key (toolchain) )";
        try!(self.conn.execute(q, &[]));

        Ok(())
    }

    pub fn delete_tables_and_close(self) -> Result<(), Box<Error>> {
        let q = "drop table if exists build_results";
        try!(self.conn.execute(q, &[]));

        let q = "drop table if exists custom_toolchains";
        try!(self.conn.execute(q, &[]));

        Ok(())
    }

    pub fn add_build_result(&self, build_result: &BuildResult) -> Result<(), Box<Error>> {
        let upsert_retry_limit = 10;
        for _ in &[0 .. upsert_retry_limit] {
            let update_q = "update build_results set success = $4, task_id = $5 where \
                            toolchain = $1 and crate_name = $2 and crate_vers = $3";

            let r = self.conn.execute(update_q, &[
                &build_result.toolchain,
                &build_result.crate_name,
                &build_result.crate_vers,
                &build_result.success,
                &build_result.task_id]);
            match r {
                Ok(rows) if rows > 0 => return Ok(()),
                Ok(_) => (/* pass */),
                Err(err) => return Err(Box::new(err))
            }

	    let insert_q = "insert into build_results values ($1, $2, $3, $4, $5)";
            
            let r = self.conn.execute(insert_q, &[
                &build_result.toolchain,
                &build_result.crate_name,
                &build_result.crate_vers,
                &build_result.success,
                &build_result.task_id]);
            if r.is_ok() { return Ok(()) }
        }

        Err(Box::from(String::from("upsert failure")))
    }

    pub fn get_build_result(&self, key: &BuildResultKey) -> Result<BuildResult, Box<Error>> {
        let q = "select * from build_results where \
                 toolchain = $1 and crate_name = $2 and crate_vers = $3";
        let stmt = try!(self.conn.prepare(q));
        for row in try!(stmt.query(&[&key.toolchain, &key.crate_name, &key.crate_vers])) {
            return Ok(BuildResult {
                toolchain: row.get(0),
                crate_name: row.get(1),
                crate_vers: row.get(2),
                success: row.get(3),
                task_id: row.get(4)
            })
        }

        Err(Box::from(String::from("no results")))
    }
}

fn make_url(dbname: &str, username: &str, password: &str, host: &str, port: u16) -> String {
    format!("postgres://{}:{}@{}:{}/{}", username, password, host, port, dbname)
}

// Tests expect username/password/db's 'crater-test' to exist
#[cfg(test)]
mod test {
    use super::*;
    use std::sync::{StaticMutex, MUTEX_INIT};

    static LOCK: StaticMutex = MUTEX_INIT;
    
    fn connect() -> Database {
        Database::connect("crater-test", "crater-test", "crater-test", "localhost", 5432).unwrap()
    }

    fn dbtest(f: &Fn()) {
        let _g = LOCK.lock().unwrap_or_else(|p| p.into_inner());
        { connect().delete_tables_and_close().unwrap(); }
        f();
    }

    #[test]
    fn connect_and_disconnect() {
        dbtest(&|| {
            let _ = connect();
        })
    }

    #[test]
    fn add_result_once() {
        dbtest(&|| {
            let expected = BuildResult {
                toolchain: String::from("nightly-2015-01-01"),
                crate_name: String::from("num"),
                crate_vers: String::from("1.0.0"),
                success: true,
                task_id: String::from("my-task-id")
            };
            let db = connect();
            assert!(db.add_build_result(&expected).is_ok());

            let actual = db.get_build_result(&BuildResultKey {
                toolchain: expected.toolchain.clone(),
                crate_name: expected.crate_name.clone(),
                crate_vers: expected.crate_vers.clone()
            }).unwrap();

            assert_eq!(expected, actual);
        })
    }

    #[test]
    fn add_result_twice() {
        dbtest(&|| {
            let expected = BuildResult {
                toolchain: String::from("nightly-2015-01-01"),
                crate_name: String::from("num"),
                crate_vers: String::from("1.0.0"),
                success: true,
                task_id: String::from("my-task-id")
            };
            let db = connect();
            assert!(db.add_build_result(&expected).is_ok());

            let expected = BuildResult {
                toolchain: String::from("nightly-2015-01-01"),
                crate_name: String::from("num"),
                crate_vers: String::from("1.0.0"),
                success: false,
                task_id: String::from("my-task-id-2")
            };

            let db = connect();
            assert!(db.add_build_result(&expected).is_ok());

            let actual = db.get_build_result(&BuildResultKey {
                toolchain: expected.toolchain.clone(),
                crate_name: expected.crate_name.clone(),
                crate_vers: expected.crate_vers.clone()
            }).unwrap();

            assert_eq!(expected, actual);
        })
    }
}
