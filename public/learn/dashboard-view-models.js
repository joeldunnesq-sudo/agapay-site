// Generated from src/browser/learn/dashboard-view-models.ts by npm run build:browser. Do not edit.
import { ACCENTS } from './dashboard-view-models-shared.js';
import {
  resourceTypeStyle,
  safeArray,
  text,
  shellFromPayload,
  page,
  simpleList,
} from './dashboard-view-models-shared.js';
import { toDashboardViewModel, toPlannerViewModel } from './view-model-dashboard-planner.js';
import {
  toFormationViewModel,
  toBooksViewModel,
  toReportsViewModel,
  toGradesViewModel,
} from './view-model-academic.js';
import { toSetupViewModel, toPrintCenterViewModel } from './view-model-setup-print.js';
function toCommunityViewModel(rawPayload) {
  const community = rawPayload?.community || {};
  return {
    shell: shellFromPayload('community', rawPayload),
    page: page('community', 'Community Resources', 'Trusted tools and encouragement for Orthodox homeschool families.'),
    comingSoon: Boolean(community.comingSoon),
    title: text(community.title, 'Community is coming soon'),
    subtitle: text(
      community.subtitle,
      'A curated resource exchange is planned after the core Learn workflow is settled.'
    ),
    detail: text(community.detail, ''),
    facebookGroupUrl: text(community.facebookGroupUrl, ''),
    resources: simpleList(community.communityResources, (resource) => ({
      id: text(resource.id, ''),
      source: text(resource.source, 'curated'),
      title: text(resource.title, 'Resource'),
      category: text(resource.category, ''),
      resourceType: text(resource.resourceType, 'Resource'),
      mediaType: text(resource.mediaType, 'Mixed Media'),
      ageRange: text(resource.ageRange, 'Family'),
      subtitle: text(resource.subtitle, ''),
      desc: text(resource.description || resource.subtitle, ''),
      url: text(resource.url, '#'),
      sharedBy: text(resource.sharedBy, ''),
      poster: text(resource.sharedBy, 'AGAPAY Community'),
      posterInitial: text(resource.sharedBy, 'A').charAt(0).toUpperCase(),
      tags: safeArray(resource.tags).length
        ? safeArray(resource.tags).map((tag) => text(tag))
        : [text(resource.category, 'Resource'), 'Orthodox', 'Homeschool'].filter(Boolean),
      votes: Number(resource.votes || 0),
      pinned: Boolean(resource.pinned || resource.vetted),
      vetted: Boolean(resource.vetted),
      flagCount: safeArray(resource.flags).length,
    })).map((resource, index) => {
      const style = resourceTypeStyle(resource.resourceType);
      return {
        ...resource,
        color: style.color,
        icon: style.icon,
        posterColor: ACCENTS[(index + 1) % ACCENTS.length],
      };
    }),
    categories: [
      'All',
      ...new Set(simpleList(community.communityResources, (resource) => text(resource.category, '')).filter(Boolean)),
    ],
    resourceTypes: [
      'All',
      ...new Set(
        simpleList(community.communityResources, (resource) => text(resource.resourceType, '')).filter(Boolean)
      ),
    ],
    mediaTypes: [
      'All',
      ...new Set(simpleList(community.communityResources, (resource) => text(resource.mediaType, '')).filter(Boolean)),
    ],
    calendar: {
      connected: Boolean(community.googleCalendarSync?.connected),
      account: text(community.googleCalendarSync?.accountLabel, 'No account connected'),
      calendar: text(community.googleCalendarSync?.calendarLabel, ''),
      scope: text(community.googleCalendarSync?.syncScopeLabel, ''),
      next: text(community.googleCalendarSync?.nextSyncLabel, ''),
    },
    history: {
      label: text(community.thisDayInHistory?.label, 'This Day in History'),
      title: text(community.thisDayInHistory?.title, ''),
      year: text(community.thisDayInHistory?.year, ''),
      summary: text(community.thisDayInHistory?.summary, ''),
      source: text(community.thisDayInHistory?.sourceLabel, ''),
    },
    guidance: safeArray(community.sharingGuidance).map((item) => text(item)),
  };
}
function toCoOpViewModel(rawPayload) {
  const coOpPayload = rawPayload?.coOp || {};
  return {
    shell: shellFromPayload('co-op', { 'co-op': coOpPayload }),
    page: page('co-op', 'Co-op', 'Coming Soon'),
    enabled: false,
    hero: {
      name: 'Co-op tools are coming soon',
      city: '',
      affiliation: 'Future Learn add-on',
      cycle: 'Deferred for launch',
      memberFamilies: 0,
      children: 0,
      meeting: 'Not available yet',
    },
    schedule: [],
    announcements: [],
    readAlouds: [],
    resources: [],
    members: [],
  };
}
export {
  toBooksViewModel,
  toCoOpViewModel,
  toCommunityViewModel,
  toDashboardViewModel,
  toFormationViewModel,
  toGradesViewModel,
  toPlannerViewModel,
  toPrintCenterViewModel,
  toReportsViewModel,
  toSetupViewModel,
};
