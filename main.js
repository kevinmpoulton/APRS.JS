

/* Globals */
var dataURI, audio;

/* Helper functions */

function $(name) {
	return document.getElementById(name);
}


class ax25
{
	
	/* Important points */
	// Address fields
	// ------- ------
	// The HDLC address field is extended beyond one octet by assigning the least-significant bit of each octet to be an "extension bit". 
	// The extension bit of each octet is set to zero, to indicate the next octet contains more address information, or one, to indicate this is the last octet of the HDLC address field. 
	// To make room for this extension bit, the amateur Radio call sign information is shifted one bit left. 

	// Bit stuffing
	// --- --------
	// In order to assure that the flag bit sequence mentioned above doesn't appear accidentally anywhere else in a frame, the sending station shall monitor 
	// the bit sequence for a group of five or more contiguous one bits. Any time five contiguous one bits are sent the sending station shall insert a zero bit 
	// after the fifth one bit. During frame reception, any time five contiguous one bits are received, a zero bit immediately following five one bits shall be discarded. 

	// Order of Bit Transmission
	// ----- -- --- ------------
	// With the exception of the FCS field, all fields of an AX.25 frame shall be sent with each octet's least-significant bit first. 
	// The FCS shall be sent most-significant bit first. 

	// SSID Field Construction
	// ---- ----- ------------
	// SSID bits are CRRSSID0 (for non-repeater use) or HRRSSID0 (for repeater use).
	// For non-repeater use this will generally be C11SSID0. 
	// For a v2 Response, C will be 0 for destination and 1 for source. 
	// E.g. for a desintation SSID of 0 it will be 01100000 and for a source SSID of 0 it will be 1110000
	// Note that when comparing to direwolf this seems to send 11100000 for both so have followed this below. 


	constructor({destination_address, destination_SSID, source_address, source_SSID, information_field}) {

		this.bitstream = [];
		
		/* These are the starting points for the CRC registers */
		this.sr1 = 0x1F;
		this.sr2 = 0x7F;
		this.sr3 = 0x0F;

		this.bitCount = 0;
		this.consecutive_ones = 0;
		
		/* Setters */
		this.destination_address = destination_address;		
		this.destination_SSID = destination_SSID;				
		this.source_address = source_address;			
		this.source_SSID = source_SSID;
		this.information_field = information_field;
		

		console.log('--Preamble');
		/* Modem lock */
		for(var i = 0; i < 32; ++i) {
			this.addByte({b: 0x7e, updateCRC: false,stuff: false});	// Position 0	
		}
		
		console.log('--first flag');
		this.addByte({b: 0x7e, updateCRC: false,stuff: false});	// Position 0	
		
		/* Destination Address - 7 Bytes */
		 console.log('--Destination Address');
		 this.addAddress({address: this.destination_address, type: 'destination', SSID: this.destination_SSID, last: false});		

		/* Source Address - 7 Bytes */
		 console.log('--Source Address');
		 this.addAddress({address: this.source_address, type: 'source', SSID: this.source_SSID, last: true});		
		
		/* Digipeter Addresses (0-8) - 0-56 bytes */
		// TODO - create digipeater addresses

		/* Control Field (UI)- 1 byte  */
		 console.log('--Control Field');
		 this.addByte({b: 0x03});	
		
		/* Protocol Field (UI)- 1 byte  */
		 console.log('--Protocol Field');
		 this.addByte({b: 0xf0});	

		/* Information Field - 1-256 bytes  */
		 console.log('--Information Field');
		 for (let c of this.information_field)
		 {
			this.addByte({b: c.toUpperCase().charCodeAt(0)});		
		 }
	
		/* FCS 2 bytes  */
		 var CRC = this.getCRC();
		 console.log('--CRC');
		 this.addByte({b: CRC.byte1, updateCRC: false});		//152
		 this.addByte({b: CRC.byte2, updateCRC: false});		//160

		
		/* Flag - 1 Byte */
		 console.log('--Flag');
		 this.addByte({b: 0x7e, updateCRC: false, stuff: false});		// Flag (end)
		 this.addByte({b: 0x7e, updateCRC: false, stuff: false});		// Flag (end)
		 this.addByte({b: 0x7e, updateCRC: false, stuff: false});		// Flag (end)

		//this.logBitstream();
	}

	recordCRCBit({bit}) {
		
		++this.bitCount;
		
		/* 1st step calculate feedback value  */
		var feedback = (this.sr3 & 1) ^ bit;
		
		/* Work backwards through the registers */

		/* First handle the shifting of sr3 */
		this.sr3 = this.sr3 >> 1;
		var sr3in = ((this.sr2 & 1) ^ feedback);
		this.sr3 = this.sr3 | sr3in << 3;

		/* Next hand the shifting of sr2 */
		this.sr2 = this.sr2 >> 1;
		var sr2in = ((this.sr1 & 1) ^ feedback);
		this.sr2 = this.sr2 | sr2in << 6;
		
		/* Finally handle the shifting of sr1 */
		this.sr1 = this.sr1 >> 1;
		var sr1in = (0 ^ feedback);
		this.sr1 = this.sr1 | sr1in << 4;
	}


	addAddress({address, SSID, type, last = false}) {

	/* This field adds an address to the frame */
	// There are 7 bytes in the address field, the first 6 are the callsign and 7 is the SSID
	// addresses are all upper case and are padded with spaces if less than 6 chacters

		var b;

		// Iterate through all 7 bytes of the address
		for (let i = 0; i < 7; i++) {					
			
			// Pad addresses if we are less than 7 spaces
			if(i < address.length) {
				b = address.charCodeAt(i);
			} else {
				b = 0x20;			// Space
			}
			
			// SSID is going to be 0111SSID before left shifting.
			
			if (i == 6)
			{
				var mask = 0x70;		//01110000

				b = mask |= SSID;
			}
			
			// We need to left shift the bits by one position to make way for the HDLC bit.
			// This drops off the MSB which is fine because callsigns should not be using ASCII 128+

			b = b << 1;				

			// The last bit of the last byte in an address field is set to one if this is the last 
			// address field in the list. 

			if (i == 6 && last)
			{
				b |= 1;
			}

			// Add the byte to the frame 
			this.addByte({b: b});


		}

	}

	addByte({b, updateCRC = true, stuff = true}) {
		
		var logText = "";

		for(let j = 0; j < 8; j++) {
			var bit = (b & Math.pow(2,j)) >> j;
			this.bitstream.push(bit);
			logText += (" " + bit);

			if(bit == 0) {
				this.consecutive_ones = 0;
			}

			if(bit == 1 && stuff == true)
			{
				this.consecutive_ones += 1;
				if (this.consecutive_ones == 5)
				{
					this.consecutive_ones = 0;
					this.bitstream.push(0);
					logText += (" *");
				}
			}

			if(updateCRC) {
				this.recordCRCBit({bit: bit});
			}
		}

		console.log(logText);
	}
	


	logBitstream() {
		for (let i = 0; i < this.bitstream.length; i = i + 8)
		{
			console.log(i,': ',this.bitstream[i], this.bitstream[i+1], this.bitstream[i+2], this.bitstream[i+3], this.bitstream[i+4], this.bitstream[i+5], this.bitstream[i+6], this.bitstream[i+7]);
		}
	}
	

	
	getCRC() {
		var byte1 = 
			(((this.sr2 & 8) != 8) * 128) + 
			(((this.sr2 & 4) != 4) * 64) + 
			(((this.sr2 & 2) != 2) * 32) + 							
			(((this.sr2 & 1) != 1) * 16) +							
			(((this.sr3 & 8) != 8) * 8) +							
			(((this.sr3 & 4) != 4) * 4) + 							
			(((this.sr3 & 2) != 2) * 2) + 							
			(((this.sr3 & 1) != 1) * 1)
		var byte2 = 
			(((this.sr1 & 16) != 16) * 128) + 
			(((this.sr1 & 8) != 8) * 64) + 
			(((this.sr1 & 4) != 4) * 32) + 							
			(((this.sr1 & 2) != 2) * 16) +							
			(((this.sr1 & 1) != 1) * 8) +							
			(((this.sr2 & 64) != 64) * 4) + 							
			(((this.sr2 & 32) != 32) * 2) + 							
			(((this.sr2 & 16) != 16) * 1) 
		return {byte1: byte1, byte2: byte2};
	}

	logCRC() {
		console.log(
			"CRC: ",

			(this.sr1 & 16) >> 4, 
			(this.sr1 & 8) >> 3, 
			(this.sr1 & 4) >> 2, 
			(this.sr1 & 2) >> 1, 
			(this.sr1 & 1) >> 0,
			
			(this.sr2 & 64) >> 6,
			(this.sr2 & 32) >> 5,
			(this.sr2 & 16) >> 4,
			(this.sr2 & 8) >> 3,
			(this.sr2 & 4) >> 2,
			(this.sr2 & 2) >> 1,
			(this.sr2 & 1) >> 0,

			(this.sr3 & 8) >> 3,
			(this.sr3 & 4) >> 2,
			(this.sr3 & 2) >> 1,
			(this.sr3 & 1) >> 0
			
		)
	}

}

class modem
{
	
	/* Important points */
	// Taken from http://n1vg.net/packet/
	// "1200 baud packet uses Bell 202 AFSK. AFSK is audio frequency shift keying, 
	// which means the signal is modulated using two audio tones, as opposed to regular FSK, 
	// where the radio frequency carrier itself is shifted in frequency. 
	// Using FSK generally requires a DC-coupled connection directly to the radio's discriminator. 
	// AFSK has the advantage of working through a regular audio path, which makes it well suited for 
	// use with radios designed for voice."
	//
	// Bell 202 uses a tone of 1200 hz for mark and 2200 hz for space. This is about as far as most packet
	// documentation goes, and unfortunately it's a bit misleading in this case. Packet uses 
	// NRZI (non-return to zero inverted) encoding, which means that a 0 is encoded as a change in tone, 
	// and a 1 is encoded as no change in tone. It is also worth noting that the tones must be continuous phase 
	// - when you shift from one tone to another, there can't be any jump in phase. 
	// For example, if you're sending a 1200 hz tone and the waveform is at its peak when you switch to 2200 hz, 
	// the waveform is still at its peak - it can't start back at zero, or any other point. 
	// This makes it impossible to generate proper AFSK using something like the Basic Stamp's audio tone function. 

	chr8() {
		return Array.prototype.map.call(arguments, function(a){
			return String.fromCharCode(a&0xff)
		}).join('');
	}

	chr32() {		
		return Array.prototype.map.call(arguments, function(a){
			return String.fromCharCode(a&0xff, (a>>8)&0xff,(a>>16)&0xff, (a>>24)&0xff);
		}).join('');
	}

	constructor() {			
		
		this.sampleRate = 44100;
		this.baud = 1200;
		
		this.freqHigh = 2200;
		this.freqLow  = 1200;
		
		this.spb = this.sampleRate / this.baud; // 36 samples per bit

		this.amplitudes = [];
		
		this.nextPhaseCorrection  = 0;
		this.sampleN = 0; 
		this.bitCount = 0;
		this.data="";
	}

	pushData(freq, samples) {

		/* Add the incremental data. Needs to respect current phase information */
		// To ensure any frequency changes remain in phase, we have to add on a phase correction so that 
		// the starting phase of the new waveform is the same as the old frequency would have been if it had continued. 
		// To do this we keep a running tally of what the next phase would have been if it had continued one timestep forward
		// and then calculate the new phase correction based on the difference. 
		
		// TODO - mmake samples dynamic, it's not used at the moment. 

		var phaseCorrection = this.nextPhaseCorrection;
		
		//console.log("starting bit",this.bitCount,"at sample number ",this.sampleN);
		samples = this.bitCount % 4 == 0 ? 36 : 37;
		samples = this.bitCount == 0 ? 37 : samples;
		for (var i = 0; i < samples; i++) {
			var phase = (2 * Math.PI) * (i / this.sampleRate) * freq + phaseCorrection;
			var v = 128 + 127 * Math.sin(phase);
			
			this.data += this.chr8(v);
			this.amplitudes.push([this.sampleN,v]);
			this.nextPhaseCorrection = (2 * Math.PI) * ((i+1) / this.sampleRate) * freq + phaseCorrection;
			this.sampleN++;
		}
		//console.log("ending bit",this.bitCount,"at sample number ",this.sampleN-1);

		this.bitCount++;
	}

	padData(samples) {
		for (var i = 0; i < samples; i++) {
			this.data += this.chr8(0);
			this.amplitudes.push(0);
		}
	}
	
	
	generateAudio() {
		
		/* This is the main loop for generating bits */
		var currentTone = this.freqLow;
			
		var newTone = 0;
		var bit = 0;

		while(this.bitstream.length) {
			bit = this.bitstream.shift();
			if(bit == 0) {
				newTone = (currentTone == this.freqHigh ? this.freqLow : this.freqHigh);
				currentTone = newTone;
				this.pushData(newTone, this.spb);
			}

			if(bit == 1) {
				this.pushData(currentTone, this.spb);
			}
			
		}

		this.padData(10)

	}

	
	playAudio() {
		

		this.data = "RIFF" + this.chr32(this.sampleN+36) + "WAVE" +
				"fmt " + this.chr32(16, 0x00010001, this.sampleRate, this.sampleRate, 0x00080001) +
				"data" + this.chr32(this.sampleN) + this.data;

		/* Generate the audio tone */
		dataURI = "data:audio/wav;base64," + escape(btoa(this.data));
		audio = new Audio(dataURI);
		audio.play();
	
		$('jmp').disabled = false;
	}
	
	generateXLSX() {
		
		/* original data */
		var filename = "audio.xlsx";
		var data = this.amplitudes;
		var ws_name = "AudioData";
		 
		var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(data);
		 
		/* add worksheet to workbook */
		XLSX.utils.book_append_sheet(wb, ws, ws_name);

		/* write workbook */
		XLSX.writeFile(wb, filename);
	}		
}

class fx25
{
	
	// FX25 Details
	// ---- -------
	// FX25 working document is http://www.stensat.org/docs/FX-25_01_06.pdf
	// FX25 algorithm is RS(48,32) - shortened RS(255, 239), 32 info bytes

	constructor({ax25}) {
		
		this.bitstream = [];
		
		console.log("Starting FX25 calculation.");
		
	}
}

function generate() {

	a = new ax25(
		{
			destination_address: "APRS",
			destination_SSID: 0,
			source_address: "M0VXY",
			source_SSID: 0,
			information_field: "HELLO"
		});
	
	f = new fx25(a);

	m = new modem();
	
	m.bitstream = a.bitstream;
	m.generateAudio();
	//a.logBitstream()
	//m.generateXLSX();
	m.playAudio();
}

