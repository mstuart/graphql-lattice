'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GQLEnum = undefined;

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _symbol = require('babel-runtime/core-js/symbol');

var _symbol2 = _interopRequireDefault(_symbol);

var _for = require('babel-runtime/core-js/symbol/for');

var _for2 = _interopRequireDefault(_for);

var _dec, _class; /**
                   @namespace GQLInterface
                   
                   */

var _GQLBase = require('./GQLBase');

var _graphql = require('graphql');

var _ModelProperties = require('./decorators/ModelProperties');

var _utils = require('./utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* Internal Symbol referring to real accessor to GQLBase model object */
const _MODEL_KEY = (0, _for2.default)('data-model-contents-value');

/* Internal Symbol referring to the static object containing a proxy handler */
const _PROXY_HANDLER = (0, _for2.default)('internal-base-proxy-handler');

/* Internal Symbol property referring to the mapping of values on the GQLEnum */
const ENUMS = (0, _symbol2.default)();

/**
 * GraphQL Enum types can be a bit picky when it comes to how scalar types
 * equate to enum values. Lattice makes this easier by allowing you to specify
 * a value or the key when your enum has a value other than the key; GraphQL
 * does not allow this by default.
 *
 * Further more, when instantiating a GQLEnum type, you can pass a string or
 * value matching the enum key or value or you can pass an object with key of
 * value and the value being either the enum key or value. If any of those
 * things match, then your `instance.value` will equate to the enum's key. If,
 * on the other hand, your supplied values do not match then `instance.value`
 * will be `null`.
 *
 * @class GQLEnum
 */
let GQLEnum = exports.GQLEnum = (_dec = (0, _ModelProperties.Getters)('symbol'), _dec(_class = class GQLEnum extends _GQLBase.GQLBase {
  constructor(enumValueOrKey, requestData) {
    super({}, requestData);

    const Class = this.constructor;
    const enums = Class.enums;
    let symbol;
    let enumVK = enumValueOrKey || null;

    // @ComputedType
    symbol = enums[enumVK] || enumVK && enums[enumVK.value] || null;

    (0, _assign2.default)(this.getModel(), {
      name: symbol ? symbol.name : null,
      value: symbol ? symbol.value : null,
      symbol: symbol ? symbol : null
    });
  }

  /**
   * Retrieves the actual symbol stored name property from the internal
   * model object for this enum instance. That is a mouthfull, but it
   * basically means that if your enum is something like:
   *
   * ```
   * enum Person { TALL, SHORT }
   * ```
   *
   * and you create an instance using any of the following
   *
   * ```
   * p = new Person('TALL')
   * p = new Person(valueFor('TALL'))
   * p = new Person({value: 'TALL'})
   * ```
   *
   * that your response to `p.name` will equate to `TALL`.
   *
   * @method ⬇︎⠀name
   * @memberof GQLEnum
   * @return {mixed} typically a String but any valid type supplied
   */
  get name() {
    const name = this.getModel().name;

    return name !== undefined && name !== null && name !== NaN ? name : null;
  }

  /**
   * Much like the `.name` getter, the `.value` getter will typically
   * retreive the name of the enum key you are requesting. In rare cases
   * where you have defined values that differ from the name, the `.value`
   * getter will retrieve that custom value from the `.value` property on
   * the symbol in question.
   *
   * This should do the right thing even if you instantiated the instance
   * using the name.
   *
   * @memberof GQLEnum
   * @method ⬇︎⠀value
   * @return {mixed} the value of the enum type; this in all likihood should
   * be a String or potentially an object
   */
  get value() {
    const value = this.getModel().value;

    return value !== undefined && value !== null && value !== NaN ? value : null;
  }

  /**
   * Determines the default type targeted by this GQLBase class. Any
   * type will technically be valid but only will trigger special behavior
   *
   * @memberof GQLEnum
   * @method ⬇︎⠀GQL_TYPE
   * @static
   * @const
   *
   * @return {Function} a type, such as `GraphQLObjectType` or
   * `GraphQLInterfaceType`
   */
  static get GQL_TYPE() {
    return _graphql.GraphQLEnumType;
  }

  /**
   * Each instance of GQLEnum must specify a map of keys and values. If this
   * method returns null or is not defined, the value of the enum will match
   * the name of the enum as per the reference implementation.
   *
   * Example:
   * ```
   *   static get values(): ?Object {
   *     const { valueOf } = this;
   *
   *     return {
   *       NAME: valueOf(value)
   *     }
   *   }
   * ```
   *
   * @method ⬇︎⠀values
   * @memberof GQLEnum
   * @static
   *
   * @return {Object|Null} an object mapping with each key mapping to an object
   * possessing at least a value field, which in turn maps to the desired value
   */
  static get values() {
    return {};
  }

  /**
   * Shorthand method to generate a GraphQLEnumValueDefinition implementation
   * object. Use this for building and customizing your `values` key/value
   * object in your child classes.
   *
   * @memberof GQLEnum
   * @method valueFor
   * @static
   *
   * @param {mixed} value any nonstandard value you wish your enum to have
   * @param {String} deprecationReason an optional reason to deprecate an enum
   * @param {String} description a non Lattice standard way to write a comment
   * @return {Object} an object that conforms to the GraphQLEnumValueDefinition
   * defined here http://graphql.org/graphql-js/type/#graphqlenumtype
   */
  static valueFor(value, deprecationReason, description) {
    const result = { value };

    if (deprecationReason) {
      result.deprecationReason = deprecationReason;
    }
    if (description) {
      result.description = description;
    }

    return result;
  }

  /**
   * For easier use within JavaScript, the static enums method provides a
   * Symbol backed solution for each of the enums defined. Each `Symbol`
   * instance is wrapped in Object so as to allow some additional properties
   * to be written to it.
   *
   * @memberof GQLEnum
   * @method ⬇︎⠀enums
   * @static
   *
   * @return {Array<Symbol>} an array of modified Symbols for each enum
   * variation defined.
   */
  static get enums() {
    // @ComputedType
    if (!this[ENUMS]) {
      const map = new _map2.default();
      const ast = (0, _graphql.parse)(this.SCHEMA);
      const array = new Proxy([], GQLEnum.GenerateEnumsProxyHandler(map));
      const values = this.values || {};
      let astValues;

      try {
        // TODO: $FlowFixMe
        astValues = ast.definitions[0].values;
      } catch (error) {
        _utils.LatticeLogs.error('Unable to discern the values from your enums SCHEMA');
        _utils.LatticeLogs.error(error);
        throw error;
      }

      // Walk the AST for the class' schema and extract the names (same as
      // values when specified in GraphQL SDL) and build an object the has
      // the actual defined value and the AST generated name/value.
      for (let enumDef of astValues) {
        let defKey = enumDef.name.value;
        let symObj = Object((0, _for2.default)(defKey));

        symObj.value = values[defKey] && values[defKey].value || defKey;
        symObj.name = defKey;
        symObj.sym = symObj.valueOf();

        map.set(symObj.name, symObj);
        map.set(symObj.value, symObj);

        // This bit of logic allows us to look into the "enums" property and
        // get the generated Object wrapped Symbol with keys and values by
        // supplying either a key or value.
        array.push(symObj);
      }

      // @ComputedType
      this[ENUMS] = array;
    }

    // @ComputedType
    return this[ENUMS];
  }

  /**
   * Due to the complexity of being able to access both the keys and values
   * properly for an enum type, a Map is used as the backing store. The handler
   * returned by this method is to be passed to a Proxy.
   *
   * @method GQLEnum#GenerateEnumsProxyHandler
   * @static
   *
   * @param {Map} map the map containing the key<->value and
   * value<->key mappings; the true storage backing the array in question.
   * @return {Object}
   */
  static GenerateEnumsProxyHandler(map) {
    return {
      /**
       * Get handler for the Map backed Array Proxy
       *
       * @memberof! GQLEnum
       * @method get
       *
       * @param {mixed} obj the object targeted by the Proxy
       * @param {string} key `key` of the value being requested
       * @return {mixed} the `value` being requested
       */
      get(obj, key) {
        if (map.has(key)) {
          return map.get(key);
        }

        return obj[key];
      },

      /**
       * Set handler for the Map backed Array Proxy.
       *
       * @memberof! GQLEnum
       * @method set
       *
       * @param {mixed} obj the object the Proxy is targeting
       * @param {string} key a string `key` being set
       * @param {mixed} value the `value` being assigned to `key`
       */
      set(obj, key, value) {
        if (isFinite(key) && value instanceof _symbol2.default) {
          map.set(value.name, value);
          map.set(value.value, value);
        }

        // Some accessor on the receiving array
        obj[key] = value;

        // Arrays return length when pushing. Assume value as return
        // otherwise. ¯\_(ツ)_/¯
        return isFinite(key) ? obj.length : obj[key];
      }
    };
  }

  /** @inheritdoc */
  static apiDocs() {
    const { DOC_CLASS, DOC_FIELDS, joinLines } = this;

    return {
      [DOC_CLASS]: joinLines`
        GQLEnums allow the definition of enum types with description fields
        and values other than a 1:1 mapping of their types and their type
        names. If you are reading this, the implementor likely did not
        contribute comments for their type.
      `
    };
  }
}) || _class);
//# sourceMappingURL=GQLEnum.js.map