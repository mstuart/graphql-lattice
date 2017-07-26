/** @module AdjacentSchema */
// @flow

import { GQLBase } from '../GQLBase'

/**
 * A decorator that does three things. First it defines the
 * module() static method that is required when using adjacent
 * schema files. Secondly, it defines a SCHEMA getter that
 * returns `GQLBase.ADJACENT_FILE`. Finally it sets a static
 * getter with the `Symbol`, `@adjacentSchema` so that other
 * can determine whether or not the decorator was used.
 *
 * @function AdjacentSchema
 * @memberof AdjacentSchema
 *
 * @param {mixed} object the object on which to apply the decorator
 * @param {String} property the name of the object or property to
 * which the decorator is being applied.
 * @param {Object} descriptor a standard Object.defineProperty style
 * descriptor object.
 */
export default function AdjacentSchema(classModule) {
  return function(target) {
    delete target.SCHEMA;
    delete target.module;

    return Object.defineProperties(target, {
      module: {
        get: () => classModule
      },

      SCHEMA: {
        get: () => GQLBase.ADJACENT_FILE
      },

      [Symbol.for('@adjacentSchema')]: {
        get: () => true
      }
    });
  }
}

export { AdjacentSchema };
