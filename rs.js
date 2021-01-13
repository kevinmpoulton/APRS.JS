// Reed-solomon encoding 
// --------------------- 
//
// This encoding process has been completely copied from the direwolf RS code. 
// https://github.com/wb2osz/direwolf 
// I had to do this because I couldn't get the 'off the shelf' RS encoders to 
// correctly replicate the results that the direwolf RS encoder was generating
// I have made some simplifications along the way as decoding is not needed.



class ReedSolomon
{
	modnn(x) {
		while (x >= this.nn) {
			x -= this.nn;
			x = (x >> this.mm) + (x & this.nn);
		}
		return x;
	}

	init_rs(codec_id) {
		
		var codecs = [
			/* Tag_00 */ [ BigInt("0x566ED2717946107E"),   0,   0,   0,   0, -1 ],  //  Reserved

			/* Tag_01 */ [ BigInt("0xB74DB7DF8A532F3E"), 255, 239, 255, 239, 0 ],  //  RS(255, 239) 16-byte check value, 239 information bytes
			/* Tag_02 */ [ BigInt("0x26FF60A600CC8FDE"), 144, 128, 255, 239, 0 ],  //  RS(144,128) - shortened RS(255, 239), 128 info bytes
			/* Tag_03 */ [ BigInt("0xC7DC0508F3D9B09E"),  80,  64, 255, 239, 0 ],  //  RS(80,64) - shortened RS(255, 239), 64 info bytes
			/* Tag_04 */ [ BigInt("0x8F056EB4369660EE"),  48,  32, 255, 239, 0 ],  //  RS(48,32) - shortened RS(255, 239), 32 info bytes

			/* Tag_05 */ [ BigInt("0x6E260B1AC5835FAE"), 255, 223, 255, 223, 1 ],  //  RS(255, 223) 32-byte check value, 223 information bytes
			/* Tag_06 */ [ BigInt("0xFF94DC634F1CFF4E"), 160, 128, 255, 223, 1 ],  //  RS(160,128) - shortened RS(255, 223), 128 info bytes
			/* Tag_07 */ [ BigInt("0x1EB7B9CDBC09C00E"),  96,  64, 255, 223, 1 ],  //  RS(96,64) - shortened RS(255, 223), 64 info bytes
			/* Tag_08 */ [ BigInt("0xDBF869BD2DBB1776"),  64,  32, 255, 223, 1 ],  //  RS(64,32) - shortened RS(255, 223), 32 info bytes

			/* Tag_09 */ [ BigInt("0x3ADB0C13DEAE2836"), 255, 191, 255, 191, 2 ],  //  RS(255, 191) 64-byte check value, 191 information bytes
			/* Tag_0A */ [ BigInt("0xAB69DB6A543188D6"), 192, 128, 255, 191, 2 ],  //  RS(192, 128) - shortened RS(255, 191), 128 info bytes
			/* Tag_0B */ [ BigInt("0x4A4ABEC4A724B796"), 128,  64, 255, 191, 2 ],  //  RS(128, 64) - shortened RS(255, 191), 64 info bytes

			/* Tag_0C */ [ BigInt("0x0293D578626B67E6"),   0,   0,   0,   0, -1 ],  //  Undefined
			/* Tag_0D */ [ BigInt("0xE3B0B0D6917E58A6"),   0,   0,   0,   0, -1 ],  //  Undefined
			/* Tag_0E */ [ BigInt("0x720267AF1BE1F846"),   0,   0,   0,   0, -1 ],  //  Undefined
			/* Tag_0F */ [ BigInt("0x93210201E8F4C706"),   0,   0,   0,   0, -1 ]   //  Undefined
		];

		
		this.correlation_tag = [
			(codecs[codec_id][0] & BigInt("0xFF00000000000000")) >> 56n,
			(codecs[codec_id][0] & BigInt("0x00FF000000000000")) >> 48n,
			(codecs[codec_id][0] & BigInt("0x0000FF0000000000")) >> 40n,
			(codecs[codec_id][0] & BigInt("0x000000FF00000000")) >> 32n,
			(codecs[codec_id][0] & BigInt("0x00000000FF000000")) >> 24n,
			(codecs[codec_id][0] & BigInt("0x0000000000FF0000")) >> 16n,
			(codecs[codec_id][0] & BigInt("0x000000000000FF00")) >> 8n,
			(codecs[codec_id][0] & BigInt("0x00000000000000FF"))
									
		];

		this.symsize = 8;		// Symbol size, bits (1-8).  Always 8 for this application.
		this.gfpoly  = 0x11d;	// Field generator polynomial coefficients.
		this.fcr     = 1;		// First root of RS code generator polynomial, index form
		this.prim	= 1;		// Primitive element to generate polynomial roots.
		this.nroots	= codecs[codec_id][1] - codecs[codec_id][2];		// RS code generator polynomial degree (number of roots). Same as checky bytes
		
		this.mm		= this.symsize;
		this.nn		= (1<<this.symsize)-1;
		this.A0		= this.nn;
		
		this.index_of = [];
		this.alpha_to = [];
		this.genpoly  = [];

		/* Generate Galois field lookup tables */
		this.index_of[0] = this.A0; 
		this.alpha_to[this.A0] = 0;
		var sr = 1;

		for(i=0; i < this.nn; i++) {
			
			this.index_of[sr] = i;
			this.alpha_to[i] = sr;
			sr <<= 1;
			
			if(sr & (1 << this.symsize)) {
				sr ^= this.gfpoly;
			}
			
			sr &= this.nn;
		}
		
		/* Find prim-th root of 1, used in decoding */
		for(var ipriml = 1; (ipriml % this.prim) != 0; ipriml += this.nn);
		
		this.iprim = ipriml / this.prim;
		
		this.genpoly[0] = 1;
		for (var i = 0, root = this.fcr * this.prim; i < this.nroots; i++, root += this.prim) {
			this.genpoly[i+1] = 1;
			
			/* Multiply rs->genpoly[] by  @**(root + x) */
			for (var j = i; j > 0; j--){
				if (this.genpoly[j] != 0)
					this.genpoly[j] = this.genpoly[j-1] ^ this.alpha_to[this.modnn(this.index_of[this.genpoly[j]] + root)];
				else
					this.genpoly[j] = this.genpoly[j-1];
			}
			
			/* rs->genpoly[0] can never be zero */
			this.genpoly[0] = this.alpha_to[this.modnn(this.index_of[this.genpoly[0]] + root)];
		}
		
		/* convert rs->genpoly[] to index form for quicker encoding */
		for (var i = 0; i <= this.nroots; i++) {
			this.genpoly[i] = this.index_of[this.genpoly[i]];
		}
	}

	encode(data) {
		/* select the correct codec for the data size */
		var codec_id = 0;
		if(data.length <= 32) 
			codec_id = 4;
		else if(data.length <= 64) 
			codec_id = 3; 
		else if(data.length <= 128) 
			codec_id = 2;
		else if(data.length <= 239) 
			codec_id = 1;
		
		this.init_rs(codec_id);

		var i = 0, j = 0, feedback = 0;
		this.checkbytes = Array(this.nroots);

		for(i=0; i < this.nn - this.nroots; i++) {
			
			feedback = this.index_of[data[i] ^ this.checkbytes[0]];
			
			if(feedback != this.nn) {      /* feedback term is non-zero */
				
				for( j = 1; j < this.nroots; j++) {
					this.checkbytes[j] ^= this.alpha_to[this.modnn(feedback + this.genpoly[this.nroots-j])];
				}
			}			

			/* Shift */
			for(var z=0; z < this.nroots-1; ++z) {
				this.checkbytes[z] = this.checkbytes[z+1];
			}

			if(feedback != this.nn) {
				this.checkbytes[this.nroots-1] = this.alpha_to[this.modnn(feedback + this.genpoly[0])];
			} else {
				this.checkbytes[this.nroots-1] = 0;
			}
		}
  
	}
}