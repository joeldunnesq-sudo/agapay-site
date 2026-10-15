'use strict';

// Compatibility boundary for incrementally extracting parish dashboard features.
// Feature scripts remain classic scripts while app.js still exposes shared globals,
// but every extracted feature must register a stable lifecycle contract here.
(function createParishFeatureRegistry(global: Window) {
  const definitions = new Map<string, Readonly<ParishRegisteredFeature>>();
  const publicFeatures = global.ParishDashboardFeatures || Object.create(null);

  function register(id: string, definition: ParishFeatureDefinition) {
    const featureId = String(id || '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(featureId)) {
      throw new TypeError('Parish feature IDs must use lowercase kebab-case.');
    }
    if (!definition || typeof definition !== 'object' || typeof definition.load !== 'function') {
      throw new TypeError(`Parish feature "${featureId}" must provide a load() function.`);
    }
    if (definitions.has(featureId)) {
      throw new Error(`Parish feature "${featureId}" is already registered.`);
    }

    const frozenDefinition = Object.freeze({ ...definition, id: featureId });
    definitions.set(featureId, frozenDefinition);
    publicFeatures[featureId] = frozenDefinition;
    return frozenDefinition;
  }

  function get(id: unknown) {
    return definitions.get(String(id || '').trim()) || null;
  }

  function list() {
    return Array.from(definitions.values());
  }

  global.ParishDashboardFeatures = publicFeatures;
  global.ParishFeatureRegistry = Object.freeze({ register, get, list });
})(window);
