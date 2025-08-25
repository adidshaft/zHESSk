
use sp1_sdk::{ProverClient, SP1Stdin, include_elf};
use std::env;

const ELF: &[u8] = include_elf!("chess-v2");

fn main() {
    println!("🔐 Generating real SP1 v2.0.0 STARK proof...");
    
    // Get chess move from environment
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
    
    println!("📋 Validating chess move: {} -> {} (move #{})", from_square, to_square, move_number);
    
    // Prepare input for SP1 program
    let mut stdin = SP1Stdin::new();
    stdin.write(&from_square);
    stdin.write(&to_square);
    stdin.write(&move_number);
    
    // Initialize SP1 client
    let client = ProverClient::from_env();
    println!("🔑 Setting up SP1 proving keys...");
    let (pk, vk) = client.setup(ELF);
    
    // Generate STARK proof
    println!("⚡ Generating SP1 STARK proof...");
    let start = std::time::Instant::now();
    
    let proof = client.prove(&pk, &stdin)
        .run()
        .expect("SP1 proof generation failed");
    
    let duration = start.elapsed();
    
    println!("✅ Real SP1 STARK proof generated!");
    println!("⏱️  Proof time: {:.2}s", duration.as_secs_f64());
    println!("📊 Proof size: {} bytes", proof.bytes().len());
    
    // Verify the proof
    println!("🔍 Verifying SP1 proof...");
    client.verify(&proof, &vk)
        .expect("SP1 proof verification failed");
    
    println!("✅ Proof verified successfully!");
    
    // Output for parsing by Node.js
    println!("PROOF_SIZE:{}", proof.bytes().len());
    println!("PROOF_TIME:{}", duration.as_millis());
    println!("PROOF_VERIFIED:true");
}
