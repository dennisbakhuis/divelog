<script lang="ts">
  import { untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import type { PublicDataFor } from '../public';
  import {
    flagEmoji,
    formatDate,
    formatDepth,
    formatLongDate,
    formatMonthYear,
    formatTime,
    isProvenance,
    ordinal,
    pluralize,
  } from '$lib/core/dive/format';
  import type { Attachment, BuddyNote, Dive } from '$lib/core/dive/types';
  import SignBox from '$lib/components/dive/SignBox.svelte';
  import BuddyNotes from '$lib/components/dive/BuddyNotes.svelte';
  import DiveFacts from '$lib/components/dive/DiveFacts.svelte';
  import DiveProfile from '$lib/components/dive/DiveProfile.svelte';
  import Gallery from '$lib/components/dive/Gallery.svelte';
  import SiteMapView from '$lib/components/dive/SiteMapView.svelte';
  import SiteMapThumb from '$lib/components/dive/SiteMapThumb.svelte';
  import MapLegend from '$lib/components/dive/MapLegend.svelte';
  import SiteAttribution from '$lib/components/dive/SiteAttribution.svelte';
  import { mapFromCommons } from '$lib/core/dive/sharing';
  import DetailTop from '$lib/components/dive/DetailTop.svelte';
  import Tabs from '$lib/components/ui/Tabs.svelte';
  import {
    defaultTitle,
    fitAnnotation,
    routeHighlights,
    routeKeys,
    routeLength,
  } from '$lib/core/dive/sitemap';
  import {
    buddyRawAddsNothing,
    routeLine,
    sameDepth,
    typesRawAddsNothing,
  } from '$lib/core/dive/dive-page';
  import { getDivelog } from '$lib/core/dive/context';
  import { followWithState, gotoWithState } from '$lib/components/dive/follow';

  const { config, urls } = getDivelog();

  const MAX_FACT_PILLS = 3;

  let { data }: { data: PublicDataFor<'dive'> } = $props();
  const dive = $derived(data.dive);

  /** The mailed sign link this page was opened from, when it belongs to this dive. */
  const signing = $derived(data.signing?.number === data.dive.number ? data.signing : null);
  /** The note signed on this page, by the token it was signed with. */
  let signedHere = $state<{ token: string; note: BuddyNote } | null>(null);
  const ownNote = $derived(
    signing && signing.state !== 'expired'
      ? signedHere?.token === signing.token
        ? signedHere.note
        : signing.note
      : null,
  );

  /** The public notes, with the signing buddy's own in place of theirs (shown even if private). */
  const notes = $derived.by(() => {
    const published = dive.buddy_notes ?? [];
    if (!ownNote) return published;
    return published.some((n) => n.person === ownNote.person)
      ? published.map((n) => (n.person === ownNote.person ? ownNote : n))
      : [...published, ownNote];
  });

  /**
   * Once the page shows, the address bar loses the token: it stays out of the analytics path,
   * of links copied from the page and of the history; the page keeps it in its state. A reload
   * is the plain dive page, and the mailed link still works.
   */
  $effect(() => {
    if (!signing) return;
    untrack(() => {
      const url = new URL(page.url);
      if (!url.searchParams.has('sign')) return;
      url.searchParams.delete('sign');
      const plain = `${url.pathname}${url.search}${url.hash}`;
      const state = {
        ...page.state,
        ...(signing.state === 'expired' ? {} : { sign: signing.token }),
      } as Parameters<typeof replaceState>[1];
      try {
        replaceState(plain, state);
      } catch {
        history.replaceState(history.state, '', plain);
      }
    });
  });
  const photos = $derived(dive.attachments.filter((a) => a.kind === 'photo'));
  const scans = $derived(dive.attachments.filter((a) => a.kind === 'scan'));
  const maps = $derived(dive.attachments.filter((a) => a.kind === 'map'));
  const hasProfile = $derived(!!dive.profile && dive.profile.length > 1);
  let tab = $state<string>('story');
  const provenance = $derived.by(() => {
    if (!isProvenance(dive.body_md)) return null;
    const text = dive.body_md.trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
  const story = $derived(provenance ? '' : dive.body_md);

  const title = $derived(dive.title || dive.site?.name || `Dive #${dive.number}`);
  const titleIsSite = $derived(!!dive.site && title === dive.site.name);
  const showTypesRaw = $derived(!typesRawAddsNothing(dive.types_raw, dive.tags));

  const photoSrc = (a: Attachment, ...names: string[]) =>
    names.map((n) => a.variants[n]).find(Boolean) ?? a.url;
  const coverPhoto = $derived(
    photos.find((a) => a.id === dive.cover_attachment_id) ?? photos[0] ?? null,
  );
  const sitePhoto = $derived(
    dive.site?.attachments.find((a) => a.kind === 'photo' && a.public) ?? null,
  );
  const locatorMap = $derived.by(() => {
    const site = dive.site;
    if (!site) return null;
    const withUrl = site.maps.filter((m) => m.url && m.collection !== 'reference');
    return (
      withUrl.find((m) => m.ref === site.default_map) ??
      withUrl.find((m) => m.collection === 'seed') ??
      withUrl[0] ??
      null
    );
  });
  const routeAnnotation = $derived(
    dive.map_annotation && dive.map ? fitAnnotation(dive.map, dive.map_annotation) : null,
  );
  const drawnMap = $derived.by(() => {
    if (dive.map) return dive.map;
    const site = dive.site;
    if (!site) return null;
    const ref =
      site.maps.find((m) => m.ref === site.default_map && m.drawn) ??
      site.maps.find((m) => m.drawn);
    return ref?.drawn ?? null;
  });
  const drawnAnnotation = $derived(dive.map ? routeAnnotation : null);
  const headerBg = $derived.by(() => {
    if (coverPhoto) return { url: photoSrc(coverPhoto, 'w1600', 'w800'), kind: 'photo' };
    if (sitePhoto) return { url: photoSrc(sitePhoto, 'w1600', 'w800'), kind: 'photo' };
    if (locatorMap?.url) return { url: locatorMap.url, kind: 'map' };
    if (drawnMap) return { url: null, kind: 'drawn' };
    return null;
  });

  const siteVisits = $derived.by(() => {
    const site = dive.site;
    if (!site || !site.dives) return '';
    const parts: string[] = [];
    if (site.dives === 1) parts.push('The only dive here');
    else if (dive.site_dive_index) parts.push(`Dive ${dive.site_dive_index} of ${site.dives} here`);
    else parts.push(`${pluralize(site.dives, 'dive')} here`);
    if (site.dives > 1 && site.first_dive) parts.push(`first ${site.first_dive.slice(0, 4)}`);
    if (site.dives > 1 && site.last_dive) parts.push(`last ${formatMonthYear(site.last_dive)}`);
    return parts.join(' · ');
  });

  function initial(name: string): string {
    return name.trim().charAt(0).toUpperCase();
  }

  function since(b: Dive['buddies'][number]): string {
    const parts: string[] = [];
    if (b.first_dive) parts.push(`since ${formatMonthYear(b.first_dive)}`);
    if (b.last_dive) parts.push(`last ${formatDate(b.last_dive)}`);
    return parts.join(' · ');
  }

  const factPills = $derived(dive.context_facts.slice(0, MAX_FACT_PILLS));
  const hasPills = $derived(!!dive.trip || !!dive.day_index || factPills.length > 0);

  const mapLine = $derived.by(() => {
    if (!dive.map) return '';
    if (!routeAnnotation) return 'No route marked';
    const line = routeLine(
      routeLength(dive.map, routeAnnotation),
      routeHighlights(dive.map, routeAnnotation),
    );
    return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
  });
  const noRoute = $derived(!!dive.map && !routeAnnotation);

  let backTo = $state<string | undefined>();
  const prevHref = $derived(dive.prev_number ? urls.dive(dive.prev_number) : null);
  const nextHref = $derived(dive.next_number ? urls.dive(dive.next_number) : null);

  function typing(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  /** `[` and `]` page to the previous and next dive, unless the key belongs to something else. */
  function onPagerKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== '[' && e.key !== ']') return;
    if (typing(e.target) || document.querySelector('dialog[open]')) return;
    const href = e.key === '[' ? prevHref : nextHref;
    if (!href) return;
    e.preventDefault();
    gotoWithState(href, { from: backTo });
  }

  type TabId = 'story' | 'original' | 'logbook';
  const tabs = $derived(
    [
      story.trim() ? { id: 'story' as TabId, label: 'Story' } : null,
      dive.notes_nl ? { id: 'original' as TabId, label: 'As written (NL)' } : null,
      scans.length ? { id: 'logbook' as TabId, label: 'Logbook page' } : null,
    ].filter((t) => t !== null),
  );
</script>

{#snippet pager()}
  <span class="pager">
    {#if prevHref}<a
        href={prevHref}
        rel="prev"
        aria-keyshortcuts="["
        onclick={(e) => followWithState(e, prevHref, { from: backTo })}
        ><span aria-hidden="true">←</span>
        <span class="dl-visually-hidden">Previous dive:</span>
        <span class="dl-num">#{dive.prev_number}</span>{#if dive.prev_site_name}<span
            class="pager-name">{dive.prev_site_name}</span
          >{/if}</a
      >{/if}
    {#if nextHref}<a
        href={nextHref}
        rel="next"
        aria-keyshortcuts="]"
        onclick={(e) => followWithState(e, nextHref, { from: backTo })}
        ><span class="dl-visually-hidden">Next dive:</span>
        {#if dive.next_site_name}<span class="pager-name">{dive.next_site_name}</span>{/if}<span
          class="dl-num">#{dive.next_number}</span
        > <span aria-hidden="true">→</span></a
      >{/if}
  </span>
{/snippet}

<svelte:window onkeydown={onPagerKey} />

<svelte:head>
  {#if signing}<meta name="robots" content="noindex, nofollow" />{/if}
</svelte:head>

<article class="dive dl-container dl-detail">
  <DetailTop
    back={{ href: urls.log(), label: 'Dive log' }}
    label="Dive navigation"
    onBackTo={(href) => (backTo = href)}
    owner={data.owner
      ? {
          edit: { label: 'Edit', href: data.editHref },
          actions: [
            ...(noRoute
              ? [{ label: 'Mark route', href: urls.admin.dive(dive.number, 'map') }]
              : []),
            { label: '+ New dive', href: urls.admin.newDive() },
          ],
          note: noRoute ? 'no route yet' : null,
        }
      : null}
  >
    {@render pager()}
  </DetailTop>
  {#if prevHref || nextHref}
    <p class="dl-visually-hidden" id="dl-pager-keys">
      Press [ for the previous dive and ] for the next dive.
    </p>
  {/if}

  <header class="head" class:has-bg={headerBg}>
    {#if headerBg?.kind === 'drawn' && drawnMap}
      <div class="head-bg drawn" aria-hidden="true">
        <SiteMapThumb map={drawnMap} annotation={drawnAnnotation} />
      </div>
    {:else if headerBg?.url}
      <div
        class="head-bg"
        class:map={headerBg.kind === 'map'}
        style:background-image={`url("${headerBg.url}")`}
        aria-hidden="true"
      ></div>
    {/if}
    <p class="dl-kicker">
      Dive <span class="dl-num">#{dive.number}</span> · {formatLongDate(dive.date)}{dive.time_in
        ? ` · ${formatTime(dive.time_in)}${dive.time_out ? `–${formatTime(dive.time_out)}` : ''}`
        : ''}
      {#if dive.visibility !== 'public'}<span class="status">{dive.visibility}</span>{/if}
    </p>
    <h1>{title}</h1>
    {#if dive.site}
      {@const site = dive.site}
      <p class="location">
        {#if titleIsSite}
          <span class="flag" aria-hidden="true">{flagEmoji(site.country_code)}</span>
        {:else}
          <span><a href={urls.site(site.slug)}>{flagEmoji(site.country_code)} {site.name}</a></span>
        {/if}
        {#if dive.section}<span class="section">{dive.section}</span>{/if}
        {#if site.area}<span>{site.area}</span>{/if}
        {#if site.region_name}<span
            ><a href={urls.region(site.region ?? '')}>{site.region_name}</a></span
          >{:else}<span>{site.country_name}</span>{/if}
      </p>
    {/if}
    {#if dive.tags.length || showTypesRaw}
      <p class="tags">
        {#each dive.tags as tag (tag)}<a class="dl-tag" data-tag={tag} href={urls.filter({ tag })}
            >{tag}</a
          >{/each}
        {#if showTypesRaw}<span class="raw" title="As ticked in the paper log"
            ><span class="dl-visually-hidden">As ticked in the paper log:</span>
            {dive.types_raw}</span
          >{/if}
      </p>
    {/if}
  </header>

  {#if signing?.state === 'expired'}
    <p class="sign-expired">This sign link has expired; ask {config.ownerName} for a new one.</p>
  {:else if signing}
    <SignBox
      token={signing.token}
      signer={signing.signer}
      state={ownNote ? 'used' : signing.state}
      note={ownNote}
      onsigned={(note) => (signedHere = { token: signing.token, note })}
    />
  {/if}

  {#if hasPills}
    <ul class="pills">
      {#if dive.trip}
        <li>
          <a class="pill pill-trip" href={urls.trip(dive.trip.slug)}
            >{dive.trip.day_index && dive.trip.days && dive.trip.days > 1
              ? `Day ${dive.trip.day_index} of ${dive.trip.days} · `
              : ''}{dive.trip.name} →</a
          >
        </li>
      {/if}
      {#if dive.day_index}
        <li class="pill">
          {dive.day_index === 1
            ? `First of ${dive.same_day.length + 1} dives that day`
            : `${ordinal(dive.day_index)} dive of the day`}{#if dive.same_day.length}<span
              class="also"
              >(also
              {#each dive.same_day as other, i (other.number)}{i ? ', ' : ''}<a
                  href={urls.dive(other.number)}
                  >#{other.number}{other.site_name ? ` ${other.site_name}` : ''}{other.time_in
                    ? ` ${formatTime(other.time_in)}`
                    : ''}</a
                >{/each})</span
            >{/if}
        </li>
      {/if}
      {#each factPills as fact (fact)}<li class="pill">{fact}</li>{/each}
    </ul>
  {/if}

  <DiveFacts {dive} />

  {#if dive.site || dive.buddies.length}
    <div class="context-cards" class:single={!dive.site || !dive.buddies.length}>
      {#if dive.site}
        {@const site = dive.site}
        <article class="dl-card where" class:no-thumb={!drawnMap && !locatorMap?.url && !sitePhoto}>
          {#if drawnMap || locatorMap?.url || sitePhoto}
            <div class="where-thumb" class:drawn={!!drawnMap}>
              {#if drawnMap}
                <SiteMapThumb map={drawnMap} annotation={drawnAnnotation} />
              {:else if locatorMap?.url}
                <img src={locatorMap.url} alt="Locator map of {site.name}" loading="lazy" />
              {:else if sitePhoto}
                <img
                  src={photoSrc(sitePhoto, 'w800', 'thumb')}
                  alt={sitePhoto.caption || site.name}
                  loading="lazy"
                />
              {/if}
            </div>
          {/if}
          <div class="where-body">
            <p class="eyebrow">Where</p>
            <h2>
              <a class="stretched" href={urls.site(site.slug)}>{site.name}</a>
            </h2>
            <p class="where-meta">
              <span>{site.site_type}</span>
              {#if site.system}<span>part of {site.system}</span>{/if}
              {#if site.max_depth_m !== null && !sameDepth(site.max_depth_m, dive.max_depth_m)}<span
                  class="dl-num">site max {formatDepth(site.max_depth_m)}</span
                >{/if}
            </p>
            {#if site.summary}<p class="where-summary">{site.summary}</p>{/if}
            {#if siteVisits}<p class="where-visits dl-num">{siteVisits}</p>{/if}
            {#if sitePhoto?.credit && !drawnMap && !locatorMap?.url}<p class="where-credit">
                Photo: {sitePhoto.credit}
              </p>{/if}
            {#if site.region_name}
              <p class="where-links">
                <a class="above" href={urls.region(site.region ?? '')}>{site.region_name} →</a>
              </p>
            {/if}
          </div>
        </article>
      {/if}
      {#if dive.buddies.length}
        <article class="dl-card with">
          <h2 class="eyebrow">With</h2>
          <ul class="team">
            {#each dive.buddies as buddy (buddy.slug)}
              <li class="buddy">
                <span class="avatar" aria-hidden="true">
                  {#if buddy.avatar_url}
                    <img src={buddy.avatar_url} alt="" width="36" height="36" loading="lazy" />
                  {:else}
                    {initial(buddy.name)}
                  {/if}
                </span>
                <span class="buddy-body">
                  <span class="buddy-name"
                    ><a href={urls.person(buddy.slug)}>{buddy.name}</a
                    >{#if buddy.first_together}<span class="badge">first dive together</span
                      >{/if}</span
                  >
                  {#if buddy.dives_together > 1}
                    <span class="buddy-meta dl-num"
                      ><a href={urls.filter({ with: buddy.slug })}
                        >{pluralize(buddy.dives_together, 'dive')} together</a
                      ></span
                    >
                    {#if since(buddy)}<span class="buddy-meta faint dl-num">{since(buddy)}</span
                      >{/if}
                  {:else if !buddy.first_together}
                    <span class="buddy-meta dl-num">the only dive together</span>
                  {/if}
                </span>
              </li>
            {/each}
          </ul>
        </article>
      {/if}
    </div>
  {/if}

  <BuddyNotes {notes} buddies={dive.buddies} />

  {#if provenance && !hasProfile}
    <p class="provenance">{provenance}</p>
  {/if}

  {#if dive.map}
    <section class="block">
      <div class="map-head">
        <h2>On the map</h2>
        <p class="map-title">
          {dive.map.title || defaultTitle(dive.map.kind)}
        </p>
      </div>
      {#if mapLine}<p class="map-summary dl-num">{mapLine}</p>{/if}
      <SiteMapView
        map={dive.map}
        title={routeAnnotation
          ? `Route of dive ${dive.number}`
          : `Map of ${dive.site?.name ?? 'the site'}`}
        route={routeAnnotation ? routeKeys(routeAnnotation) : null}
        legs={routeAnnotation?.route ?? []}
        path={routeAnnotation?.path ?? []}
        pathTurn={routeAnnotation?.turn_at ?? null}
        turn={routeAnnotation?.turn ?? null}
        pins={routeAnnotation?.pins ?? []}
      />
      <MapLegend map={dive.map} />
      {#if dive.site && mapFromCommons({ ref: dive.map.id, collection: 'drawn' }, dive.site.origin)}
        <SiteAttribution
          origin={dive.site.origin}
          attribution={dive.site.attribution}
          variant="map"
        />
      {/if}
      {#if routeAnnotation && (routeAnnotation.route.length || routeAnnotation.path.length)}
        <p class="way-key">
          <span class="in">way in</span><span class="out">way out</span><span class="both"
            >both ways</span
          >
        </p>
      {/if}
      {#if routeAnnotation?.note}<p class="map-note">{routeAnnotation.note}</p>{/if}
      {#if routeAnnotation?.pins.length}
        <ol class="pin-list">
          {#each routeAnnotation.pins as pin (pin.id)}<li>{pin.note || '—'}</li>{/each}
        </ol>
      {/if}
    </section>
  {/if}

  {#if dive.profile && dive.profile.length > 1}
    <section class="block">
      <div class="map-head">
        <h2>Profile</h2>
        {#if dive.profile_meta}
          <p class="map-summary dl-num">
            {#if dive.profile_meta.deco_model}{dive.profile_meta.deco_model}{/if}
            {#if dive.profile_meta.gf}· GF {dive.profile_meta.gf}{/if}
            {#if dive.profile_meta.deco}· deco{/if}
            {#if dive.computer.length}· Perdix #{dive.computer.join(', #')}{/if}
          </p>
        {/if}
      </div>
      <DiveProfile
        samples={dive.profile}
        maxDepth={dive.max_depth_m}
        meta={dive.profile_meta}
        avgDepth={dive.avg_depth_m}
      />
      {#if provenance}<p class="provenance">{provenance}</p>{/if}
    </section>
  {/if}

  {#if tabs.length}
    <section class="block">
      <Tabs {tabs} bind:active={tab} label="Notes on this dive">
        {#snippet panel(id)}
          {#if id === 'story'}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by the backend -->
            <div class="dl-prose">{@html dive.body_html}</div>
          {:else if id === 'original'}
            <blockquote class="original">{dive.notes_nl}</blockquote>
          {:else}
            <Gallery items={scans} kind="scan" />
          {/if}
        {/snippet}
      </Tabs>
    </section>
  {/if}

  {#if photos.length}
    <section class="block">
      <h2>Photos</h2>
      <Gallery items={photos} kind="photo" />
    </section>
  {/if}

  {#if maps.length}
    <section class="block">
      <h2>Maps</h2>
      <Gallery items={maps} kind="map" />
    </section>
  {/if}

  {#if dive.private}
    <section class="block private">
      <h2>Only you see this</h2>
      <dl class="numbers">
        {#if dive.private.people.length}<div class="wide">
            <dt>People</dt>
            <dd class="small">
              {dive.private.people
                .map(
                  (p) =>
                    `${p.first_name}${p.last_name ? ` ${p.last_name}` : ''}${p.email ? ` <${p.email}>` : ''}`,
                )
                .join(' · ')}
            </dd>
          </div>{/if}
        {#if dive.private.buddy_raw && !buddyRawAddsNothing(dive.private.buddy_raw, dive.private.people)}<div
          >
            <dt>Paper log · buddies</dt>
            <dd class="small">{dive.private.buddy_raw}</dd>
          </div>{/if}
        {#if dive.private.buddy_role}<div>
            <dt>Paper log · role</dt>
            <dd class="small">{dive.private.buddy_role}</dd>
          </div>{/if}
        {#if dive.private.operator}<div class="wide">
            <dt>Operator / guide</dt>
            <dd class="small">{dive.private.operator}</dd>
          </div>{/if}
        {#if dive.gas_raw}<div>
            <dt>Paper log · gas</dt>
            <dd class="small">{dive.gas_raw}</dd>
          </div>{/if}
        {#if dive.private.site_name_raw}<div>
            <dt>Paper log · site</dt>
            <dd class="small">
              {dive.private.site_name_raw}{dive.private.area_raw
                ? `, ${dive.private.area_raw}`
                : ''}
            </dd>
          </div>{/if}
        {#if dive.private.sketch}<div class="wide">
            <dt>Sketch on the page</dt>
            <dd class="small">{dive.private.sketch}</dd>
          </div>{/if}
        {#if dive.private.flags.length}<div class="wide">
            <dt>Transcription notes</dt>
            <dd class="small">{dive.private.flags.join(' · ')}</dd>
          </div>{/if}
      </dl>
    </section>
  {/if}

  {#if dive.site}
    <section class="block">
      <a class="dl-btn dl-btn-ghost" href={urls.site(dive.site.slug)}
        >All dives at {dive.site.name} →</a
      >
    </section>
  {/if}

  <nav class="crumbs bottom" aria-label="Dive navigation, end of page">
    <a href={backTo ?? urls.log()}><span aria-hidden="true">←</span> Dive log</a>
    {@render pager()}
  </nav>
</article>

<style>
  .map-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .map-summary {
    font-size: 14px;
    color: var(--dl-color-text-muted);
  }
  .map-head + .map-summary {
    margin: -6px 0 12px;
    color: var(--dl-color-text);
  }
  .map-title {
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
  .map-note {
    margin: 10px 0 0;
  }
  .way-key {
    display: flex;
    gap: 16px;
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--dl-color-text-muted);
  }
  .way-key span::before {
    content: '';
    display: inline-block;
    width: 18px;
    height: 0;
    margin-right: 6px;
    vertical-align: middle;
    border-top: 3px solid #ef4444;
  }
  .way-key .out::before {
    border-top-color: #22c55e;
  }
  .way-key .both::before {
    border-top-style: dashed;
    border-top-color: #22c55e;
    background: #ef4444;
    height: 3px;
    box-sizing: border-box;
  }
  .pin-list {
    margin: 8px 0 0;
    padding-left: 22px;
    color: var(--dl-color-text-muted);
    font-size: 14px;
  }
  .dive {
    padding-top: 40px;
    padding-bottom: var(--dl-space-section);
  }
  .crumbs {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: 14px;
    margin-bottom: 28px;
  }
  .crumbs a {
    text-decoration: none;
    color: var(--dl-color-text-muted);
  }
  .crumbs a:hover {
    color: var(--dl-color-accent);
  }
  .pager {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    min-width: 0;
  }
  .pager a {
    display: inline-flex;
    gap: 0.4em;
    min-width: 0;
    text-decoration: none;
    color: var(--dl-color-text-muted);
  }
  .pager a:hover {
    color: var(--dl-color-accent);
  }
  .pager-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 16ch;
  }
  .status {
    margin-left: 8px;
    color: var(--dl-color-warm);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 11px;
  }
  .head h1 {
    font-size: clamp(30px, 5vw, 48px);
    margin-bottom: 10px;
  }
  .head .dl-kicker {
    align-items: flex-start;
  }
  .head .dl-kicker::before {
    flex: none;
    margin-top: 0.55em;
  }
  .location {
    color: var(--dl-color-text-muted);
    font-size: 15.5px;
  }
  .location > span:not(.flag) + span::before {
    content: '·';
    margin-right: 0.35em;
    color: var(--dl-color-text-faint);
  }
  .location a {
    text-decoration: none;
    color: var(--dl-color-text);
  }
  .location a:hover {
    color: var(--dl-color-accent);
  }
  .section {
    color: var(--dl-color-accent);
  }
  .flag {
    margin-right: 0.35em;
  }
  .tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tags .dl-tag {
    text-decoration: none;
  }
  .raw {
    font-size: 12px;
    color: var(--dl-color-text-faint);
    font-family: var(--dl-font-mono);
  }
  .numbers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 14px;
    margin: 28px 0 0;
    padding: 20px;
    border-radius: var(--dl-radius);
    border: 1px solid var(--dl-color-border);
    background: var(--dl-color-bg-elevated);
  }
  .numbers .wide {
    grid-column: 1 / -1;
  }
  .numbers dt {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .numbers dd {
    margin: 2px 0 0;
    font-size: 18px;
    font-weight: 500;
  }
  .numbers dd.small {
    font-size: 14px;
    font-weight: 400;
    color: var(--dl-color-text);
  }
  .crumbs.bottom {
    margin: 44px 0 0;
    padding-top: 20px;
    border-top: 1px solid var(--dl-color-border);
  }
  .head {
    position: relative;
    isolation: isolate;
  }
  .head.has-bg {
    padding: 28px 24px 18px;
    margin: 0 -24px;
    border-radius: var(--dl-radius-lg);
    overflow: hidden;
  }
  .head-bg {
    position: absolute;
    inset: -12px;
    z-index: -1;
    background-size: cover;
    background-position: center;
    opacity: 0.16;
    filter: blur(6px) saturate(0.8);
  }
  .head-bg.map {
    opacity: 0.3;
    filter: blur(1.5px);
  }
  .head-bg.drawn {
    inset: 0;
    left: 40%;
    opacity: 0.12;
    filter: none;
  }
  .head.has-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      90deg,
      var(--dl-color-bg) 0%,
      color-mix(in srgb, var(--dl-color-bg) 70%, transparent) 55%,
      color-mix(in srgb, var(--dl-color-bg) 35%, transparent) 100%
    );
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
  }
  .pill {
    display: inline-block;
    max-width: 100%;
    padding: 3px 10px;
    border: 1px solid var(--dl-color-border-strong);
    border-radius: 999px;
    font-family: var(--dl-font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
    text-decoration: none;
  }
  .pill a {
    color: var(--dl-color-text);
    text-decoration: none;
  }
  .pill a:hover,
  a.pill:hover {
    color: var(--dl-color-accent);
    border-color: var(--dl-color-accent);
  }
  a.pill-trip {
    color: var(--dl-color-warm);
    border-color: color-mix(in srgb, var(--dl-color-warm) 45%, transparent);
  }
  .also {
    margin-left: 0.4em;
  }
  .also a {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .context-cards {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 14px;
    margin-top: 14px;
  }
  .context-cards.single {
    grid-template-columns: minmax(0, 1fr);
  }
  .eyebrow {
    margin: 0 0 6px;
    font-family: var(--dl-font-mono);
    font-weight: 400;
    line-height: inherit;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dl-color-text-muted);
  }
  .where {
    position: relative;
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 18px;
    padding: 16px 18px;
    transition: border-color 0.15s ease;
  }
  .where.no-thumb {
    grid-template-columns: minmax(0, 1fr);
  }
  .where:hover {
    border-color: var(--dl-color-accent);
  }
  .where-thumb {
    width: 148px;
    height: 110px;
    border-radius: var(--dl-radius-sm);
    background: var(--dl-color-surface-2);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .where-thumb.drawn {
    background: var(--dl-color-bg-elevated);
    border: 1px solid var(--dl-color-border);
  }
  .where-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .where-body h2 {
    font-size: 19px;
    margin: 0 0 4px;
  }
  .stretched {
    color: var(--dl-color-text);
    text-decoration: none;
  }
  .stretched::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .where:hover .stretched {
    color: var(--dl-color-accent);
  }
  .where-meta {
    display: flex;
    flex-wrap: wrap;
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--dl-color-text-muted);
  }
  .where-meta span:not(:last-child)::after {
    content: '·';
    margin: 0 6px;
    color: var(--dl-color-text-faint);
  }
  .where-summary {
    margin: 0 0 8px;
    font-size: 14.5px;
    line-height: 1.5;
  }
  .where-visits {
    margin: 0;
    font-size: 12.5px;
    color: var(--dl-color-text-muted);
  }
  .where-credit {
    margin: 6px 0 0;
    font-size: 11.5px;
    color: var(--dl-color-text-faint);
  }
  .where-links {
    margin: 8px 0 0;
    font-size: 13px;
  }
  .above {
    position: relative;
    z-index: 1;
    text-decoration: none;
  }
  .with {
    padding: 16px 18px;
  }
  .team {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .buddy {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .buddy-name a,
  .buddy-meta a {
    color: inherit;
    text-decoration: none;
  }
  .buddy-name a:hover,
  .buddy-meta a:hover {
    color: var(--dl-color-accent);
  }
  .buddy-meta a {
    text-decoration: underline;
    text-decoration-color: var(--dl-color-border-strong);
    text-underline-offset: 2px;
  }
  .avatar {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--dl-color-surface-2);
    border: 1px solid var(--dl-color-border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-family: var(--dl-font-display);
    font-weight: 600;
    color: var(--dl-color-text-muted);
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .buddy-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .buddy-name {
    font-weight: 600;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .badge {
    font-family: var(--dl-font-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 1px 8px;
    border-radius: 999px;
    color: var(--dl-color-warm);
    background: var(--dl-color-warm-soft);
  }
  .buddy-meta {
    font-size: 12.5px;
    color: var(--dl-color-text-muted);
  }
  .buddy-meta.faint {
    color: var(--dl-color-text-faint);
  }
  .sign-expired {
    margin: 14px 0 0;
    font-size: 14px;
    color: var(--dl-color-text-muted);
  }
  .provenance {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--dl-color-text-faint);
  }
  @media (max-width: 720px) {
    .context-cards {
      grid-template-columns: minmax(0, 1fr);
    }
    .head.has-bg {
      margin: 0 -12px;
      padding: 22px 12px 14px;
    }
  }
  @media (max-width: 480px) {
    .where {
      grid-template-columns: minmax(0, 1fr);
    }
    .where-thumb {
      width: 100%;
      height: 140px;
    }
  }
  .block {
    margin-top: 44px;
  }
  .block h2 {
    font-size: 22px;
    margin-bottom: 14px;
  }
  .block.private {
    border-top: 1px dashed var(--dl-color-warm);
    padding-top: 20px;
  }
  .block.private h2 {
    color: var(--dl-color-warm);
    font-size: 16px;
  }
  .original {
    margin: 0;
    padding: 12px 18px;
    border-left: 3px solid var(--dl-color-border-strong);
    color: var(--dl-color-text-muted);
    white-space: pre-wrap;
    font-style: italic;
  }
</style>
