const querystring = require('querystring')

const ForbiddenError = require('../error/ForbiddenError')
const UnprocessableEntityError = require('../error/UnprocessableEntityError')
const ValidationError = require('../error/ValidationError')

const encryption = require('../utils/encryption')
const validation = require('../utils/validation')

const SINGLE_EMAIL_FIELDS = ['_to']
const DELIMETERED_EMAIL_FIELDS = ['_cc', '_bcc', '_replyTo']

class Request {
  constructor (event, encryptionKey) {
    this.recipients = {
      to: '',
      cc: [],
      bcc: [],
      replyTo: []
    }

    this.responseFormat = 'html'
    this.redirectUrl = null

    this.pathParameters = event.pathParameters || {}
    this.queryStringParameters = event.queryStringParameters || {}
    this.userParameters = querystring.parse(event.body)
    this.encryptionKey = encryptionKey
  }

  validate () {
    return Promise.resolve()
      .then(() => this._validateResponseFormat())
      .then(() => this._validateNoHoneyPot())
      .then(() => this._validateSingleEmails())
      .then(() => this._validateDelimiteredEmails())
      .then(() => this._validateToRecipient())
      .then(() => this._validateRedirect())
  }

  _validateResponseFormat () {
    if ('format' in this.queryStringParameters) {
      if (this.queryStringParameters.format !== 'json' && this.queryStringParameters.format !== 'html') {
        return Promise.reject(new UnprocessableEntityError('Invalid response format in the query string'))
      } else {
        this.responseFormat = this.queryStringParameters.format
      }
    }

    return Promise.resolve()
  }

  _validateNoHoneyPot () {
    if ('_honeypot' in this.userParameters && this.userParameters._honeypot !== '') {
      return Promise.reject(new ForbiddenError('You shall not pass'))
    }

    return Promise.resolve()
  }

  _validateToRecipient () {
    if (this.recipients.to === '') {
      return Promise.reject(new UnprocessableEntityError("Please provide a recipient in '_to' field"))
    }
  }

  _validateSingleEmails () {
    return new Promise((resolve, reject) => {
      SINGLE_EMAIL_FIELDS
        .filter((field) => field in this.userParameters)
        .forEach((field) => {
          let input = this.userParameters[field]
          if (!this._parseEmail(input, field)) {
            return reject(new UnprocessableEntityError(`Invalid email in '${field}' field`))
          }
        })

      return resolve()
    })
  }

  _validateDelimiteredEmails () {
    return new Promise((resolve, reject) => {
      DELIMETERED_EMAIL_FIELDS
        .filter((field) => field in this.userParameters)
        .forEach((field) => {
          let inputs = this.userParameters[field].split(';')
          inputs.forEach((input) => {
            if (!this._parseEmail(input, field)) {
              return reject(new UnprocessableEntityError(`Invalid email in '${field}' field`))
            }
          })
        })

      return resolve()
    })
  }

  _validateRedirect () {
    if ('_redirect' in this.userParameters) {
      if (!validation.isWebsite(this.userParameters['_redirect'])) {
        return Promise.reject(new UnprocessableEntityError("Invalid website URL in '_redirect'"))
      } else {
        this.responseFormat = 'plain'
        this.redirectUrl = this.userParameters['_redirect']
      }
    }

    return Promise.resolve()
  }

  _parseEmail (input, field) {
    // check for plain text email addresses
    if (validation.isEmail(input)) {
      this._addEmail(input, field)
      return true
    }

    // check for encrypted email addresses
    let inputDecrypted = encryption.decrypt(input, this.encryptionKey)
    if (validation.isEmail(inputDecrypted)) {
      this._addEmail(inputDecrypted, field)
      return true
    }
  }

  _addEmail (email, field) {
    if (DELIMETERED_EMAIL_FIELDS.indexOf(field) === -1) {
      this.recipients[field.substring(1)] = email
    } else {
      this.recipients[field.substring(1)].push(email)
    }
  }
}

module.exports = Request
