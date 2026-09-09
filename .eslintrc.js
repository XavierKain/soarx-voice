module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Jest globals are only configured for files matching the default test
      // patterns; the setup file sits at the root and needs them too.
      files: ['jest.setup.js'],
      env: {jest: true},
    },
  ],
};
