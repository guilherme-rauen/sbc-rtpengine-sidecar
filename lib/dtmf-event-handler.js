const dgram = require('dgram');
const assert = require('assert');
const debug = require('debug')('jambonz:rtpengine-sidecar');
const detectors = new Map();
let socket;

assert.ok(process.env.RTPENGINE_DTMF_LOG_PORT,
  'env RTPENGINE_DTMF_LOG_PORT (and start rtpengine with --dtmf-log-dest=IP46:PORT)');

module.exports = (logger) => {

  if (!socket) {
    debug(`creating socket listening on port ${process.env.RTPENGINE_DTMF_LOG_PORT}`);
    socket = dgram.createSocket('udp4');
    socket
      .on('listening', () => {
        const address = socket.address();
        logger.info(`dtmf-event-handler listening on ${address.address}:${address.port} for DTMF`);
      })
      .on('error', (err) => {
        logger.info({err}, 'dtmf-event-handler error');
        socket.close();
      })
      .on('message', (msg, rinfo) => {
        try {
          debug(`got message: ${msg}`);
          const payload = JSON.parse(msg);
          const {callid, source_tag} = payload;
          const key = `${callid}:${source_tag}`;
          if (payload.type === 'DTMF' && detectors.has(key)) {
            const {host, port} = detectors.get(key);
            socket.send(msg, port, host, (err) => {
              if (err) logger.info({err, callid}, 'Error sending DTMF to sbc app');
            });
          }
          else if (payload.type === 'subscribeDTMF') {
            detectors.set(key, {
              host: rinfo.address,
              port: payload.listenPort,
              time: Date.now()
            });
          }
          else if (payload.type === 'unsubscribeDTMF') {
            detectors.delete(key);
          }
        } catch (err) {
          logger.info({err}, 'dtmf-event-handler: error parsing DTMF event');
        }
      });
    socket.bind(process.env.RTPENGINE_DTMF_LOG_PORT);
  }
};
