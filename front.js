const trace = require('@risingstack/trace')
const express = require('express')
const XYZ = require('xyz-core')

const app = express()
const EXPRES_PORT = 4001

// setup xyz
const front = new XYZ({
  selfConf: {
    name: 'front.ms',

    host: '127.0.0.1',

    // all nodes will connect to seed node which is Client service
    seed: ['127.0.0.1:5000'],

    transport: [{type: 'HTTP', port: 4000}],

    logLevel: 'verbose'
  }
})

// setup express app
app.post('/service', function (req, res) {
  front.call({
    servicePath: req.query['service_path']
  }, (err, body) => {
    res.json({err: err, body: body})
  })
})

app.listen(EXPRES_PORT, function () {
  // use xyz's logger
  front.logger.info(`EXPRESS :: Front app listening on port ${EXPRES_PORT}!`)
})
