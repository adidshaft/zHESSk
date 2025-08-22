
use sp1_sdk::{ProverClient, SP1Stdin, include_elf};

const ELF: &[u8] = include_elf!("minimal-chess");

fn main() {
    println!("Generating minimal chess proof...");
    
    let mut stdin = SP1Stdin::new();
    stdin.write(&52u8);
    stdin.write(&36u8);
    
    let client = ProverClient::from_env();
    let (pk, vk) = client.setup(ELF);
    
    let proof = client.prove(&pk, &stdin).run().expect("Proving failed");
    
    println!("Proof generated successfully!");
    println!("Proof size: {} bytes", proof.bytes().len());
    
    client.verify(&proof, &vk).expect("Verification failed");
    println!("Proof verified!");
}
