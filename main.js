// Globals 
var dataURI, audio;

// Helper functions

function $(name) {
	return document.getElementById(name);
}

function convert_positions(decimal) {
	// Converts decimal coordinates from javascript to deg/min/sec
	var coord = {};
	coord.degrees = Math.floor(Math.abs(decimal));
	coord.minutes = Math.floor((Math.abs(decimal) - coord.degrees) * 60);
	coord.seconds = Math.floor((Math.abs(decimal) - coord.degrees - (coord.minutes / 60)) * 3600);
	coord.hemisphere = decimal > 0 ? true : false;
	return coord;
}


class ax25
{
	
	// This class represents a raw AX25 frame.
	
	constructor({destination_address, destination_SSID, source_address, source_SSID, digipeaters, information_field}) {
		
		// Create a new AX25 packet from the fields provided in the constructor call.

		// This records if the build is successful or not, only set to true at the end of the frame.
		this.success = false;

		// Holds any return errors
		this.error_message = "";
		
		// This and the FX25 objects both have bitstream arrays to represent all the bits in the frame.
		this.bitstream = [];
		
		// These are the starting points for the CRC registers. 
		// These will get iterated each time we add a bit to the bitstream to calculate the CRC. 
		this.sr1 = 0x1F;
		this.sr2 = 0x7F;
		this.sr3 = 0x0F;
		
		// Number of bits we have added.
		this.bitCount = 0;
		this.consecutive_ones = 0;
		
		// The following code takes the passed parameters and validates them, before we start doing the actual frame construction. 

		// Start with the destination and source addresses. 3-6 upper case numbers or letters.
		const re_address = RegExp('^[0-9A-Z]{3,6}$');
		if(re_address.test(destination_address) === false) {
			this.error_message = "Incorrectly formattted destination address. Should be 3-6 CAPITAL letters/numbers characters only.";
			return;
		} 
		
		this.destination_address = destination_address;	 
		
		if(re_address.test(source_address) === false) {
			this.error_message = "Incorrectly formattted source address. Should be 3-6 CAPITAL letters/numbers characters only.";
			return;
		}
		
		this.source_address = source_address;

		
		// Now the source and destination SSIDs, should be number between 0 and 15.
		const re_SSID = RegExp('^[0-9]{1,2}$');
		if(re_SSID.test(destination_SSID) === false || destination_SSID < 0 || destination_SSID > 15) {
			this.error_message = "Incorrectly formattted destination SSID. Should be a number between 0 and 15.";
			return;
		}

		this.destination_SSID = destination_SSID;				
		
		
		if(re_SSID.test(source_SSID) === false || source_SSID < 0 || source_SSID > 15) {
			this.error_message = "Incorrectly formattted source SSID. Should be a number between 0 and 15.";
			return;
		}
		
		this.source_SSID = source_SSID;
		
		// Digipeaters. This is really cludegy and needs improving. Digipeaters are a comma separeted list, but each 
		// digipeater and include the SSID as well in the format WIDE2-1 where the '1' is the SSID. This is consistent
		// with how other sofware including direwolf represents digipeaters addresses.

		const re_digipeater = RegExp('^[0-9A-Z]{3,6}\-{0,1}[0-9]{0,1}[0-9]{0,1}$');
		
		this.digipeaters = [];
		digipeaters = digipeaters.split(',');
		for(var i =0; i < digipeaters.length; ++i) {
			if(digipeaters[i].trim() == "") {
				continue;
			}
			if(re_digipeater.test(digipeaters[i]) === false) {
				this.error_message = "Incorrectly formattted digipeater. Should be in format ABCDEF-S or ABCDEF (e.g. WIDE2-2 or RELAY).";
				return;
			}
			
			if(digipeaters[i].search('-') == -1) {
				this.digipeaters[i] = {address: digipeaters[i], SSID: 0};
			} else {
				this.digipeaters[i] = {
					address: digipeaters[i].substring(0,digipeaters[i].search('-')),
					SSID: parseInt(digipeaters[i].substring(digipeaters[i].search('-')+1,digipeaters[i].length))
				};
			}
		}
		
		// Now sort the information field . 
		const re_message = RegExp('^[ -~]{1,254}$');

		var informationField = "";
		
		// Each type of information field has a different format. This one deals with a bulletin.
		if(information_field.type == 'bulletin') {
			if(re_message.test(information_field.text) === false) {
				this.error_message = "Message field should printable ASCII characters only. ";
				return;
			}

			informationField += ':BLN1     :';
			informationField += information_field.text;
		}
		 
		// The other type of information field covered in this code is a position report.
		// TODO this needs refining a bit, it's a bit bodged.

		if(information_field.type == 'position') {

			if(latitude < -90 || latitude > 90 ) {
				this.error_message = "Latitude should be within + or - 90 degrees.";
				return;
			}
			
			if(longitude < -180 || latitude > 180 ) {
				this.error_message = "Longitude should be within + or -180 degrees.";
				return;
			}

			var latitude  = convert_positions(information_field.latitude);
			var longitude = convert_positions(information_field.longitude);
						
			informationField   = "!";
			
			informationField  = informationField + latitude.degrees.toString().padStart(2,'0');
			informationField  = informationField + latitude.minutes.toString().padStart(2,'0');
			informationField  = informationField + ".";
			informationField  = informationField + latitude.seconds.toString().padStart(2,'0');
			informationField  = informationField + (latitude.hemisphere ? "N" : "S");
			
			informationField += "/";

			informationField  = informationField + longitude.degrees.toString().padStart(3,'0');
			informationField  = informationField + longitude.minutes.toString().padStart(2,'0');
			informationField  = informationField + ".";
			informationField  = informationField + longitude.seconds.toString().padStart(2,'0');
			informationField  = informationField + (longitude.hemisphere ? "E" : "W");
			
			//symbol code
			informationField = informationField + "-";
			
			//comment
			informationField = informationField + information_field.comment;
			
		}
		
		
		this.information_field = informationField;
		
		// OK, now we can start actually assembling the AX25 frame.
		// We will do this by working through each byte sequentially and adding them to the bitstream for this frame. 
		// Some bytes will be stuffed, and some will count towards the CRC check bytes at the end of the frame. 

		// It is excluded from stuffing and doesn't count towards the CRC
		this.addByte({b: 0x7e, updateCRC: false,stuff: false});	// Position 0	
		
		// Destination Address - 7 Bytes 
		this.addAddress({address: this.destination_address, type: 'destination', SSID: this.destination_SSID, last: false});		

		// Source Address - 7 Bytes 
		this.addAddress({address: this.source_address, type: 'source', SSID: this.source_SSID, last: (this.digipeaters.length > 0 ? false : true)});		
		
		// Digipeter Addresses (0-8) - 0-56 bytes		
		for(var i = 0; i < this.digipeaters.length; ++i) {
			this.addAddress({address: this.digipeaters[i].address, type: 'digipeater', SSID: this.digipeaters[i].SSID, last: (i == (this.digipeaters.length - 1))});		
		}

		// Control Field (UI)- 1 byte 
		// This and the protocol field are fixed constants and identify this as an AX25 frame. 
		this.addByte({b: 0x03});	
		
		// Protocol Field (UI)- 1 byte  
		this.addByte({b: 0xf0});	

		// Information Field - 1-256 bytes 
		for (let c of this.information_field)
		{
			this.addByte({b: c.toUpperCase().charCodeAt(0)});		
		}
	
		// As we have been adding bytes amd bits, some have been updating the CRC as we go along.
		// Now we just need to get the current state of the two CRC bytes and add them in at the end.

		var CRC = this.getCRC();
		this.addByte({b: CRC.byte1, updateCRC: false});
		this.addByte({b: CRC.byte2, updateCRC: false});
			
		// End the AX25 frame with a 0x7e flag
		this.addByte({b: 0x7e, updateCRC: false, stuff: false});
		
		// And we have been successful. We now have a bitstream made up of all the bytes we've added.
		this.success = true;

	}
	
	recordCRCBit({bit}) {
		
		/* This function udpates the sr1,sr2,sr3 registers each time a bit is recorded. The CRC algorithm
		   is based on the algorithm here http://practicingelectronics.com/articles/article-100003/article.php */

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
		console.log(address, SSID, type, last);

		// This function adds an address to the frame. 
		// There are 7 bytes in the address field, the first 6 are the callsign and 7 is the SSID
		// addresses are all upper case and are padded with spaces if less than 6 chacters 
		
		// The current byte
		var b;

		// Iterate through all 7 bytes of the address
		for (let i = 0; i < 7; i++) {					
			
			// Pad addresses if we are less than 7 spaces
			if(i < address.length) {
				b = address.charCodeAt(i);
			} else {
				b = 0x20;			// Space
			}
			
			// Byte 6 (7th byte) of the address is the SSID. The SSID is a single byte with different bits representing
			// different aspects of the routing. SSID is going to be 0111SSID before left shifting.
			if (i == 6 && type != 'digipeater')
			{
				var mask = 0x70;		
				b = mask |= SSID;
			}

			if (i == 6 && type == 'digipeater')
			{
				var mask = 0x30;		
				b = mask |= SSID;
			}
			
			// We need to left shift the bits by one position to make way for the HDLC bit.
			// This drops off the MSB which is fine because addresses should not be using ASCII 128+

			b = b << 1;				

			// The LSB bit of the last byte in an address field is set to one if this is the last 
			// address field in the list. This is how receiver knows how to move to the next part 
			// of the frame.

			if (i == 6 && last)
			{
				b |= 1;
			}

			// Add this byte to the frame 
			this.addByte({b: b});
		}

	}

	addByte({b, updateCRC = true, stuff = true}) {
		
		// This is the core function of adding bytes to the bitstream.
		
		for(let j = 0; j < 8; j++) {

			var bit = (b & Math.pow(2,j)) >> j;
			this.bitstream.push(bit);
			
			// This code looks to see if 5 consecutive ones have been sent. 
			// If so, a 'spare' zero is inserted into the bitstream. This is
			// done so that receivers can tell the difference between 0x7e flags
			// and other combinations 

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
				}
			}
			
			// If this bit is in scope for the CRC calculation, calcualte the next
			// iteration.

			if(updateCRC) {
				this.recordCRCBit({bit: bit});
			}
		}

	}
	


	logBitstream() {

		// Log the bitstream.
		for (let i = 0; i < this.bitstream.length; i = i + 8)
		{
			console.log(i,': ',this.bitstream[i], this.bitstream[i+1], this.bitstream[i+2], this.bitstream[i+3], this.bitstream[i+4], this.bitstream[i+5], this.bitstream[i+6], this.bitstream[i+7]);
		}
	}
	

	
	getCRC() {
		
		// Return the two CRC bytes, assembled from the sr1, sr2, sr3 registers.
		
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

}

class modem
{
	
	// The modem class takes a bitstream (either from the AX25 and the FX25 frame) 
	// and converts it into an audio stream. 
	
	// This and the chr32 function are used to encode the wav file.
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
		
		// Create the modem class. This could be updated later on to set different modem parameters. 
		
		this.freqHigh = 2200;			
		this.freqLow  = 1200;
		
		this.sampleRate = 44100;		// This is the sample rate of the audio output in samples per second. 
		this.baud = 1200;				// 1200 baud is 1200 bits per second
		
		// 44100 div by 1200 = 36.75 bits per second. 36.75 bits per second is a problem, because that means
		// later on we are going to have to deal with non-integer bits. Other implementations deal with this
		// by taking a multiple of 1200 (e.g. 48000) and either using that native sampleRate or later on down
		// sampling. I'm not that clever so had to deal with this by working in a 36,36,36,37,36,36,36,37 pattern
		this.spb = this.sampleRate / this.baud; 
		
		// This amplitudes array is where we add the audio samples. So this holds the audio stream.
		this.amplitudes = [];
		
		this.nextPhaseCorrection  = 0;
		this.sampleN = 0; 
		this.bitCount = 0;
		this.data="";

	}

	pushData(freq, samples) {

		// Add a bit of data to the audo stream. We need to respect current phase information.
		// To ensure any frequency changes remain in phase, we have to add on a phase correction so that 
		// the starting phase of the new waveform is the same as the old frequency would have been if it had continued. 
		// To do this we keep a running tally of what the next phase would have been if it had continued one timestep forward
		// and then calculate the new phase correction based on the difference. 
		
		var phaseCorrection = this.nextPhaseCorrection;
		
		// We keep track of the bitcount as we go on, so we can make sure every fourth bit is 37 bits, not 36. 
		// of course, this should all really be updated if we change the baud rate please. 

		samples = this.bitCount % 4 == 0 ? 36 : 37;
		samples = this.bitCount == 0 ? 37 : samples;
		
		// This code adds the sine wave to the amplitudes list. 
		for (var i = 0; i < samples; i++) {
		
			var phase = (2 * Math.PI) * (i / this.sampleRate) * freq + phaseCorrection;
			var v = 128 + 127 * Math.sin(phase);
			
			this.data += this.chr8(v);
			this.amplitudes.push([this.sampleN,v]);
			this.nextPhaseCorrection = (2 * Math.PI) * ((i+1) / this.sampleRate) * freq + phaseCorrection;
			this.sampleN++;
		}
		
		// And now onto the next bit. 
		this.bitCount++;
	}
	
	padData(samples) {
		
		// Add a certain amount of 'white space' to the audio stream. 
		for (var i = 0; i < samples; i++) {
			this.data += this.chr8(0);
			this.amplitudes.push(0);
		}
	}
	
	
	generateAudio(source) {
		
		// This function loops through the bit stream and then inserts the tones into the audio stream.
		this.bitstream = source.bitstream;
		
		var currentTone = this.freqLow;
			
		var newTone = 0;
		var bit = 0;
		
		// Iterating through the bitstream.
		while(this.bitstream.length) {

			// Get the next bit from the bitstream.
			bit = this.bitstream.shift();

			// This is the FSK part. We are using NRZI in which a 0 bit is encoded as a change, and a
			// 1 bit is encoded as not change. So the tone alternates if a 0 bit is encoded, and is unchanged if
			// a 1 bit is encoded. 

			if(bit == 0) {
				newTone = (currentTone == this.freqHigh ? this.freqLow : this.freqHigh);
				currentTone = newTone;
				this.pushData(newTone, this.spb);
			}

			if(bit == 1) {
				this.pushData(currentTone, this.spb);
			}
			
		}

		// We want to add 10 samples of white space at the end, just to stop any clipping effects.
		this.padData(10)

	}

	
	playAudio() {
		
		// Generate the encoded WAV audio from the data.

		this.data = "RIFF" + this.chr32(this.sampleN+36) + "WAVE" +
				"fmt " + this.chr32(16, 0x00010001, this.sampleRate, this.sampleRate, 0x00080001) +
				"data" + this.chr32(this.sampleN) + this.data;

		dataURI = "data:audio/wav;base64," + escape(btoa(this.data));
		audio = new Audio(dataURI);
		audio.play();
	
	}
	
	generateXLSX() {
		
		// I've left this in for future testing purposes - it dumps the audio stream to a
		// spreadsheet so you can inspect the audio file. 
		
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
	constructor(a) {
		
		// This class takes an AX25 frame (more specifically, it's bitstream) and wraps it in some error 
		// correction data, meaning that if errors occur 'over the air' they are are able to be resolved. 
		// This is in contracts to AX25 where a single bit error means the whole frame will be discarded.

		this.bitstream = [];
		
		// First step is to get the AX25 frame padded. The Reed-Solomon algo needs to have certain bit_sized
		var bits_required = 239 * 8;
		if(a.bitstream.length <= 32 * 8) 
			bits_required = 32 * 8;
		else if(a.bitstream.length <= 64 * 8) 
			bits_required = 64 * 8;
		else if(a.bitstream.length <= 128 * 8) 
			bits_required = 128 * 8;
		else if(a.bitstream.length >= 239 * 8) {
			console.log("Error - packet too big.");
			return false;
		}

		var bits_remaining = bits_required - a.bitstream.length;

		while (bits_remaining> 0)
		{
			if (bits_remaining >= 8)
			{
				this.addByte({b: 0x7e, target: a.bitstream});					
				bits_remaining -=8;
			} else {
				this.addByte({b: 0x7e, target: a.bitstream, section: bits_remaining});
				bits_remaining = 0;
			}
		}
		
		// Turn the bitstream into bytes for rs calculation
		var message = [];
		for (var b = 0; b < a.bitstream.length/8; ++b)
		{
			var byte_start_bit = b * 8;
			
			var byte = 0;
			for (var bit = 0; bit <8 ; ++bit )
			{
				byte += (a.bitstream[byte_start_bit + bit] << bit);
			}
			
			message.push(byte);
		}
		
		var rs = new ReedSolomon();
		rs.encode(message);

		// Now assemble all the components into the packet
		// preamble + correlation tag + ax25 package + fx25 package
		
		var ax25 = this.bitstream;
		this.bitstream = [];

		// Preamble!
		for (var i=0; i<16; ++i )
		{
			this.addByte({b: 0x7e});	
		}
		
		// Correlation tag!
		for (var i=rs.correlation_tag.length - 1;i >= 0; --i )
		{
			this.addByte({b: Number(rs.correlation_tag[i])});
		}

		// AX25 packet
		this.bitstream = this.bitstream.concat(a.bitstream);
		
		// Checkbytes
		for (var i=0;i<rs.checkbytes.length ;++i )
		{
			this.addByte({b: rs.checkbytes[i]})
		}
		
		// Finally 2 postamble bytes
		this.addByte({b: 0x7e});	
		this.addByte({b: 0x7e});	

	}

	addByte({b, target=this.bitstream, section=8}) {

		var logText = "";
		for(let j = 0; j < section; j++) {
			var bit = (b & Math.pow(2,j)) >> j;
			target.push(bit);
			logText += (" "+bit);
		}
		

	}


	


	logBitstream() {
		for (let i = 0; i < this.bitstream.length; i = i + 8)
		{
			console.log(i,': ',this.bitstream[i], this.bitstream[i+1], this.bitstream[i+2], this.bitstream[i+3], this.bitstream[i+4], this.bitstream[i+5], this.bitstream[i+6], this.bitstream[i+7]);
		}
	}
	
}


function generate() {
	
	// This function takes the form input, creates the objects to represent the ax25 and the fx25 frame and then 
    // passes them to the modem object to turn into a sound file to play in the browser or to save as a file.  

	// Clear any displayed errors on the form.
	$('text_error').style.display = "none";

	// We create a message object to represent the different parts of the packet payload - currently two types are supported,
	// a simple text message or an encoded position + comment.
	var message = {};
	message.type = $('select_type').value;
	
	switch (message.type) {
		case 'position':
			message.longitude = $('text_longitude').value;
			message.latitude  = $('text_latitude').value;
			message.comment  = $('text_comment').value;
			break;
		
		case 'bulletin':
			message.text     =  $('text_message').value;
			break;
		
	}
	
	// First part of the process is to create the raw AX25 packet.
	a = new ax25(
		{
			destination_address: ($('text_destination').value),
			destination_SSID: ($('text_destination_SSID').value),
			source_address: ($('text_src').value),
			source_SSID: ($('text_src_SSID').value),
			digipeaters: ($('text_digipeaters').value),	
			information_field: message
		});
	
	// The AX25 constructor returns a result object that can be used to feed back to the form
	// for example, validation errors. If a.success is false, display ther error and give up.

	if(!a.success) {
		console.log(a.error_message);
		$('text_error').style.display = "block";
		$('text_error').innerHTML = a.error_message;
		return;
	}

	// Now, take the ax25 frame and wrap it with the necessary components for a fx25 frame.
	f = new fx25(a);
	
	// Create a modem object to make the actual sounds from the bitstream in the fx25 frame. 
	m = new modem();
	
	// Generate the audio. This populates the global dataURI variable with the audo data.
	m.generateAudio(f);
	
	// Play the audio through the browser, taking the global dataURI variable and playing it in browser.
	m.playAudio();
	
	// Because we've got the audio ready, make the download/play buttons on the form available to press. 
	$('button_download').disabled = false;
	$('button_play').disabled = false;
}

function playAudio() {
	// Play the audio. This only works once the audio file has been generated.
	
	m.playAudio();
}

