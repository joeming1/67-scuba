# FixFlow LDR integration

The ESP32 sends normalized `brightness_pct` events to FixFlow's existing `POST /api/sensor-events` endpoint. Three consecutive readings below 25% create one lighting ticket and notify the assigned technician. After a repair attempt, three readings at or above 40% satisfy the sensor side of verification; the technician must still submit a photo that Gemini approves before the ticket closes.

## One-time demo flow

The student portal's **Run the LDR sensor demo** button opens `/demo/sensors`. The page polls the server every 1.5 seconds and shows the latest received brightness, reading time, and consecutive-sample counts. Clicking **Run demo — simulate dim room** sends exactly three simulated readings. The ESP32 sketch sends a physical reading every two seconds while the board is powered and its firmware is running; power it off when the hardware demo is over. The simulator is the no-hardware fallback.

After the technician records a repair attempt, click **Send bright readings** or physically brighten the LDR. The private student tracking page shows ticket timeline updates. Sensor recovery alone does not close the ticket; the technician completion photo must also pass Gemini verification.

## ESP32 setup

1. Wire the LDR and fixed resistor as a voltage divider between 3.3 V and GND. Connect the midpoint to GPIO 34 (ADC1). Do not feed 5 V into an ESP32 ADC pin.
2. Start FixFlow on the same Wi-Fi network with a LAN-accessible bind address:

   ```sh
   HOST=0.0.0.0 PORT=3001 node demo/server.mjs
   ```

3. Find the computer's LAN IP address and replace `YOUR_COMPUTER_LAN_IP` in `esp32_ldr.ino` with that address. Keep port `3001` in the sketch URL to match the command above; if you use another port, update both. The device URL must end in `/api/sensor-events`; `localhost` will not work from the ESP32.
4. Enter Wi-Fi credentials locally in the sketch. Do not commit real SSIDs or passwords. Gemini, email, and Twilio keys stay in the server's ignored `demo/.env`; never add them to the firmware.
5. Open `/demo/sensors` and `/sensor-calibrate.html`. With the board powered, read its serial monitor under the demo room's bright and dark conditions. Enter those representative ADC readings in the calibration helper and copy the generated constants into the sketch.
6. Flash the sketch and confirm normalized values move toward 100 in brighter conditions and toward 0 in darker conditions. The server needs three consecutive readings below 25% to create a ticket.

The ESP32 samples every two seconds, averages ten ADC reads, waits for NTP time synchronization, and skips a sample when Wi-Fi is unavailable. Calibration values are room-specific demo values, not lux measurements. Keep the simulator available as a fallback if the board or Wi-Fi is unreliable.
