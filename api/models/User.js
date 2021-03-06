/**
 * User
 *
 * @module      :: Model
 * @description :: A short summary of how this model works and what it represents.
 *
 */
var bcrypt = require('bcrypt');
var Promise = require('bluebird');

module.exports = {

  attributes: {
    username: {
      type: Sequelize.STRING,
      required: true,
      unique: true,
      validate: {
        len: {
          args: [3,30],
          msg: 'Username must be between 3 and 30 characaters.'
        }
      }
    },
    password: {
      type: Sequelize.STRING,
      required: true,
      validate: {
        len: {
          args: [6,30],
          msg: 'Password must be between 6 and 30 characaters.'
        }
      }
    }
  },

  associations: function() {
    User.hasMany(Review, { foreignKey: 'user_id', as: 'reviews' });
    User.hasMany(Example, { foreignKey: 'user_id', as: 'examples' });
    User.hasMany(Star, { foreignKey: 'user_id', as: 'starred_packages' });
  },


  options: {
    underscored: true,

    hooks: {

      beforeCreate: function(user) {
        return Promise.promisify(bcrypt.genSalt)(10)
        .then(function(salt) {
          return Promise.promisify(bcrypt.hash)(user.password, salt)
          .then(function(hash) {
            user.password = hash;
            return user;
          });
        });
      }

    },

    getterMethods: {
      uri: function()  {
        return '/users/:id'
          .replace(':id', encodeURIComponent(this.id));
      },
      api_uri: function()  {
        return '/api/users/:id'
          .replace(':id', encodeURIComponent(this.id));
      }
    },

    classMethods: {
      findById: function(id) {
        return User.findOne({
          where: {id: id}
        });
      },

      findByUsername: function(u) {
        return User.findOne({
          where: {username: u}
        });
      }
    }

  }

};
