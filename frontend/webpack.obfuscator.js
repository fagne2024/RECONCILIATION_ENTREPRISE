const JavaScriptObfuscator = require('webpack-obfuscator');

/**
 * Configuration Webpack personnalisée pour obfusquer les fichiers JavaScript
 * uniquement en build de production.
 */
module.exports = (config, options) => {
  // N'appliquer l'obfuscation qu'en mode production
  const isProduction = options.configuration === 'production' || 
                       (process.env.NODE_ENV === 'production' && !options.configuration);
  
  if (!isProduction) {
    return config;
  }

  config.plugins = config.plugins || [];

  config.plugins.push(
    new JavaScriptObfuscator(
      {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: false,
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        rotateStringArray: true,
        selfDefending: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        transformObjectKeys: true,
        unicodeEscapeSequence: false,
      },
      [
        // Éviter d'obfusquer certains petits bundles critiques
        'runtime.*.js',
        'polyfills.*.js',
      ]
    )
  );

  return config;
};
