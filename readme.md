# An APRS packet generator and modem in Javascript

By Kevin Poulton, M0VXY

## What is this?
An APRS packet modem (send only) written in javscript with no external dependencies.

## What is this for?

APRS is a packet based data service used in Amateur Radio for tactical communications - i.e. what is happening locally in terms of time and space.

This code was built as an exercise to prove to myself I understood the mechanics of APRS before actually using it. Unfortunately, I went too deep and ended up creating a full end to end packet generating modem (maybe techincally just a 'mo'!). Therefore, this is going to be most useful to anyone who wants to actually know how APRS works and wants to create their own implementation in some platform. It's probably also good if you want a super-easy test tool for APRS and can't be bothered to download an existing app to either your computer or mobile device. 

I chose Javascript for the implementation mainly because I wanted it to be easily accessible but there are no realy library dependencies and outside of the audio generation 'modem' code it should be trival to transplant to any other language. To support the idea of implementing your own APRS code I've included detail below about what reference documentation is relevant. Interestingly the biggest limitation of Javascript/HTML implementation is probably there is no way to directly CAT control your radio from a browser.

It is definitely not a production ready APRS tool, though it should work 'out of the box' for many use cases and has been tested live on air. If you have come to this page looking for a production ready APRS tool, you probably want something like [Direwolf](https://github.com/wb2osz/direwolf) which is pretty solid and works on all platforms. 

In particular, this code only generates APRS packets, not receives, decodes or relays them.

I really enjoyed learning about APRS, but a lot of my time was trying to work out the weird undocumented points that make a successful implementation. Direworlf is great and fully open source but is optimised C++ that makes for tricky deconstruction and understanding. I hope you can pick up my code and use it to answer some of your questions if you are trying to make a implementation. Please do send me an e-mail using kevin@secondinternet.com if you have any questions!

## How to use
Open the HTML file (you can access it directly on github pages by [clicking here](https://kevinmpoulton.github.io/APRS.JS/)) and scroll down. Complete the fields. Tune your radio to your local APRS frequency (144.800 in the UK) and play the resulting sound through your radio using FM. Then head over to an APRS tracker (e.g. [aprs.fi](https://aprs.fi/)) and see if you have been heard by any local igates (APRS receivers that send received packets to the internet). Note, ideally you want to play the sound directly to your radio via a cable, but I have tested by holding the microphone of the radio near my PC speaker... audio coupling! Not recommended but it does work.

## Principles of APRS
So a thirty second introduction to APRS. APRS is 'Amateur Packet Radio Service' and is used to transmit encoded messages over radio. These messages are typically, but not exclusively, 'tactical' - i.e. who, what, where and when, designed to be temporary in the sense they have a short lifespan of interest and are not really targetted at any one individual. In practice, you can use the messages for pretty much whatever you want as there are a number of message formats, from weather reports right down to simple text messages. I started reading because I wanted to send packets via the ISS, but lots of cool use cases exist - telemetry trackers for baloons, home brew weather stations, etc. etc. 

## Key reference documents
For the real detail you will want to look at the various APRS spec documents. I referred to these heavily. There are three key ones as outlined on [this page](http://www.aprs.org/aprs12.html) - APRS1.01, APRS1.1 Addendum and APRS1.2. Unfortunately each document assumes you have read the one before and does not cumulate the points from the previous version. The good news however is most of the principles are in the first spec doc - with the later versions dealing with (generally) smaller points. Some of the key technical details are available more clearly in [this document] (http://nic.vajn.icu/PDF/ham/AX25/ax25.html). 

I also leant heavily on other resources, in particular [this page](http://practicingelectronics.com/articles/article-100003/article.php) for the reference on how to generate the CRC bytes for the AX25 frame, and [NV1G's excellent page](http://n1vg.net/packet/) which highlights some of 'hidden truths' behind coding an APRS implementation. 

## Process for generating packets.
The process to generate an audio packet containing interpretable APRS data is broadly as follows. The javascript code provided works through in this order. 

### 1. Assemble the message data you want to encode
As stated in the Principles section above, there are lots of different ways you can encode data into an APRS packet. Most of the APRS1.01 spec document is used to address this point and it won't be duplicated here, but the code presented supports two options - bulletin and position. Bulletin is a simple text update, position allows for latitude and longitude to be transmitted along with a short message. 

### 2. Collect the packet metadata. 
These are the different fields that explain to a receiver who it is from and what should be done with the packet. These are as follows. 

- Sender callsign and SSID. This is your callsign which allows you to identify yourself in received packets. SSID allow for one callsign to run more than one station. For example, you could have an APRS generator running in your car as well as testing this script, in each case you just need to make sure that the SSID is different. The defauly is 0. However, there is a rule in place that means in certain cases the SSID also determines the icon used to display your position on a map (if you are broadcasting a position message).
- Destination address - the address of the recepient. For APRS there is a convention that this is used as the identifier of the software sending the packet! It seems you can apply to have your own code allocated to your software. I have fixed (in the UI at least) this as APZXXX which is the code for 'experimental software'. Again destination can have an SSID, this should be 0 for most cases. 
- Digipeaters - this specifies the digipeaters you wish to have your message relayed through. You can leave this blank, and anyone local who can receive, will receive. But there are probably two special cases you want to consider. Firstly, WIDE2-2 or WIDE2-1 allows for your packets to be digipeated (relayed) either twice or once in turn. Secondly, if you wish to send your packet through the [International Space Station] (https://k7kez.com/aprs-settings-for-the-iss-international-space-station/) you will want your path to include at least ARISS or maybe NA1SS. 

### 3. Create an AX25 frame 
So this is the 'core' of the process. The AX25 frame is a bitstream - a series of bits - that includes the packet metadata, the message, and the Cyclic Redundancy Check (CRC) which will be added in the next stage. The linked specification documents include the detail, but basically the way my implementation works is to work through appending byte by byte the metadata, some fixed bytes that identify the type of AX25 frame, and the message. As we add each byte to the bitsteam we consider if this byte should be included in the CRC check calculation in the next stage, and also if we need to 'bit-stuff'. Bit stuffing is a nice eccentricity of the AX25 protocol that basically means you can only have a maxiumum of 5 consecutive '1's in the bitstream. This is to prevent confusion with the initial 'start of frame' flag which is 01111110 in binary (0x7E hex). 

### 4. Calculate the CRC for the AX25 frame and append it to the frame
APRS is sent over noisy RF links. Simple AX25 has no error correction and instead relies on a checksum like process that allows the receiver to check the bit by bit integrity of the received frame, discarding completely any frames where the received CRC does not match the received bits. The CRC check is fairly fiddly but not too complicated and there are a few different ways of doing it. The version I have used, derived from the link above, is a state machine based approach that changes each time an eligible bit is written to the bitstream, so that by the time it is ready to append the two bytes that make up the CRC to the frame, they are sitting already calculated ready to be used. 

### 5. Add the necessary FX25 Forward Error Correction
FX25 is an 'optional extra' in the APRS world. It basically is a series of bytes added before and after the AX25 frame, that allow active error correction to be made by the receving party. This is in contrast to the simple CRC check that the raw AX25 contains, which only allows the receiver to identify if the frame has been received correctly (and discard it if not). FX25 is not necessary for APRS (you could simply bypass this step and pass the raw AX25 frame directly the modem code) but I don't have a proper vertical antenna for VHF, so was using a 'compremise' antenna and finding almost none of my packets were being received. FX25 completely resolved this and allowed near 100% decoding of my broadcast packets. 

The two core parts are a 'correlation tag' that goes before the AX25 frame and identifies the exact error-correcting algorithm being used; and then a series of bytes that are derived from encoding the message using [Reed Solomon error correction](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction) and appended after the AX25 frame. Together these new bytes sandwich the original AX25 frame so cleverly, anything that doesn't recognise FX25 can still interpret the original frame. 

With the Reed-Solomon error correction implementation, there is a weird thing here going on I don't understand, as whilst my first attempt implementation based on different tutorials gave the same results as the standard python and JS libraries that exist, I couldn't get them to align with the direwolf implementation which seemed to behave differently. So I simply refactored the C++ implementation from direwolf into JS and quietly stepped away - it works but I don't know why!

There are two key classes in my code that implement FX25 FEC. The 'fx25' class takes a raw 'ax25' frame in its constructor and adds the necessary parts. The ReedSolomon class is the refactored direwolf implementation.

### 6. Encode the final frame in audio
The final stage is converting the bitstream (now comprised of the core AX25 frame and the FX25 error correction bytes at the start and finish) into audio tones. This is done in my code by the 'modem' class. APRS uses 1200 baud (i.e. 1200 bits per second) Bell 202 AFSK (Audio Frequency Shift Keying). This means 1200 Hz and 2200Hz tones are used to identify different bit values. However, in practice, APRS uses 'NRZI' (non-return to zero inverted) encoding. Basically this means zeros in the bitstream are encoded as a change in tone, and ones are encoded as no change in tone. However, there are two real complicating factors to consider. The first is the idea of continuous phase - if you are changing from one tone to another you can't just start the amplitude of the new tone at zero and go from there, you have to maintain the phase to prevent phase discontinuity. Secondly, you need to deal with the fact that 1200 baud might not divide nicely into your sample rate, so you might need to write code to deal with non-integer samples per bit (or if you are feeling hacky just set your sample rate to a nice multiple of 1200!).

In my code this is handled by the 'modem' class and is locked to a sample rate of 44100 samples/sec (which equates to 36.75 samples per bit, allowing me to demonstrate how non-integer samples per bit are dealt with!).
