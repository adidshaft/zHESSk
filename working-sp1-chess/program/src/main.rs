
#![no_main]
sp1_zkvm::entrypoint!(main);

use sp1_zkvm::io::{read, commit};

pub fn main() {
    // Read chess move data
    let from_square: u8 = read();
    let to_square: u8 = read();
    let move_number: u32 = read();
    
    // Basic chess move validation
    let is_valid_squares = from_square < 64 && to_square < 64;
    let is_different_squares = from_square != to_square;
    let is_valid_move_number = move_number > 0;
    
    let is_valid = is_valid_squares && is_different_squares && is_valid_move_number;
    
    // Commit results
    commit(&is_valid);
    commit(&from_square);
    commit(&to_square);
    commit(&move_number);
    
    // Simple checksum for verification
    let checksum = from_square as u32 + to_square as u32 + move_number;
    commit(&checksum);
}
