const trace = require('@risingstack/trace')
const XYZ = require('xyz-core')

let ms = new XYZ({
  selfConf: {
    name: 'client.ms',

    transport: [{type: 'HTTP', port: 5000}],

    host: '127.0.0.1'
  }
})

setInterval(() => {
  ms.call({
    servicePath: 'task/cpu'
  }, (err, body) => {
    console.log(`task/cpu response: ${err} ${body}`)
  })
}, 100)

setInterval(() => {
  ms.call({
    servicePath: 'task/io'
  }, (err, body) => {
    console.log(`task/io response: ${err} ${body}`)
  })
}, 500)

console.log(ms)
