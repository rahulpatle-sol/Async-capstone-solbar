use anchor_lang::prelude::*;

declare_id!("DJ93cETS4yvu8e4SnySFkAwknXzLFJwYNd46EcH7WsUg");

#[program]
pub mod solbar {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
