
#![no_main]
sp1_zkvm::entrypoint!(main);

use sp1_zkvm::io::{read, commit};

pub fn main() {
    let from: u8 = read();
    let to: u8 = read();
    
    let is_valid = from != to && from < 64 && to < 64;
    
    commit(&is_valid);
}
