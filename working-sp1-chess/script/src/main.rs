
use sp1_sdk::{ProverClient, SP1Stdin, include_elf};
use std::env;

const ELF: &[u8] = include_elf!("stable-chess");

fn main() {
    println!("🔐 Generating real SP1 STARK proof for chess move...");
    
    // Read input from environment variables
    let from_square: u8 = env::var("FROM_SQUARE")
        .unwrap_or("52".to_string())
        .parse()
        .unwrap_or(52);
    
    let to_square: u8 = env::var("TO_SQUARE")
        .unwrap_or("36".to_string())
        .parse()
        .unwrap_or(36);
        
    let move_number: u32 = env::var("MOVE_NUMBER")
        .unwrap_or("1".to_string())
        .parse()
        .unwrap_or(1);
    
    println!("📋 Chess move: {} → {} (move #{})", from_square, to_square, move_number);
    
    // Setup inputs
    let mut stdin = SP1Stdin::new();
    stdin.write(&from_square);
    stdin.write(&to_square);
    stdin.write(&move_number);
    
    // Initialize SP1 prover
    let client = ProverClient::from_env();
    
    println!("🔑 Setting up SP1 proving keys...");
    let (pk, vk) = client.setup(ELF);
    
    println!("⚡ Generating STARK proof...");
    let start = std::time::Instant::now();
    
    // Generate proof - using compressed mode for faster generation
    let proof = client.prove(&pk, &stdin)
        .compressed()
        .run()
        .expect("Proof generation failed");
    
    let duration = start.elapsed();
    
    println!("✅ Real SP1 STARK proof generated!");
    println!("⏱️  Generation time: {:.2}s", duration.as_secs_f64());
    println!("📊 Proof size: {} bytes", proof.bytes().len());
    
    // Verify proof
    println!("🔍 Verifying proof...");
    let verify_start = std::time::Instant::now();
    
    client.verify(&proof, &vk)
        .expect("Proof verification failed");
    
    let verify_duration = verify_start.elapsed();
    println!("✅ Proof verified in {:.2}ms!", verify_duration.as_millis());
    
    // Read public outputs
    let is_valid = proof.public_values.read::<bool>();
    let from_verified = proof.public_values.read::<u8>();
    let to_verified = proof.public_values.read::<u8>();
    let move_num_verified = proof.public_values.read::<u32>();
    let checksum = proof.public_values.read::<u32>();
    
    println!("🎯 Chess move validation results:");
    println!("   Valid move: {}", is_valid);
    println!("   From square: {}", from_verified);
    println!("   To square: {}", to_verified);
    println!("   Move number: {}", move_num_verified);
    println!("   Checksum: {}", checksum);
    
    // Output for parsing by Node.js
    println!("PROOF_RESULT:SUCCESS");
    println!("PROOF_SIZE:{}", proof.bytes().len());
    println!("PROOF_TIME:{}", duration.as_millis());
    println!("PROOF_VERIFIED:{}", is_valid);
    println!("VERIFY_TIME:{}", verify_duration.as_millis());
}
