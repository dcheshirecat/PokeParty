#!/usr/bin/env python3
"""Builds js/tcg/data-species.js from PokéAPI's CSV dumps.

Run from the repo root:   python3 tools/build_tcg_data.py
It downloads a few CSV files from GitHub (≈12 MB) and writes a compact
species + move table the card game turns into cards (see js/tcg/cards.js).
Change MAX_ID to cover more generations.
"""
import csv, io, json, os, sys, urllib.request
from collections import defaultdict

MAX_ID = 1025  # Gen 1–9
BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
EN = '9'
TYPES = ['', 'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
         'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy']
AILMENTS = {'1': 'par', '2': 'slp', '3': 'frz', '4': 'brn', '5': 'psn', '6': 'cnf'}
SKIP = {'self-destruct', 'explosion', 'dream-eater', 'focus-punch', 'fake-out', 'snore', 'spit-up',
        'beat-up', 'present', 'magnitude', 'natural-gift', 'last-resort', 'belch', 'struggle', 'false-swipe',
        'feint', 'synchronoise', 'sky-drop', 'future-sight', 'doom-desire', 'shell-trap', 'water-spout',
        'eruption', 'first-impression', 'steel-beam', 'mind-blown'}


def fetch(name):
    cache = os.path.join(os.environ.get('TCG_CSV_CACHE', ''), name + '.csv')
    if os.environ.get('TCG_CSV_CACHE') and os.path.exists(cache):
        return list(csv.DictReader(open(cache, encoding='utf-8')))
    print('downloading', name, file=sys.stderr)
    data = urllib.request.urlopen(BASE + name + '.csv').read().decode('utf-8')
    return list(csv.DictReader(io.StringIO(data)))


def main():
    species = {int(r['id']): r for r in fetch('pokemon_species') if int(r['id']) <= MAX_ID}
    names = {int(r['pokemon_species_id']): r['name'] for r in fetch('pokemon_species_names')
             if r['local_language_id'] == EN}
    stats = defaultdict(dict)
    for r in fetch('pokemon_stats'):
        pid = int(r['pokemon_id'])
        if pid <= MAX_ID:
            stats[pid][int(r['stat_id'])] = int(r['base_stat'])
    types = defaultdict(list)
    for r in sorted(fetch('pokemon_types'), key=lambda r: int(r['slot'])):
        pid = int(r['pokemon_id'])
        if pid <= MAX_ID:
            types[pid].append(TYPES[int(r['type_id'])])
    moves = {int(r['id']): r for r in fetch('moves')}
    meta = {int(r['move_id']): r for r in fetch('move_meta')}
    move_names = {int(r['move_id']): r['name'] for r in fetch('move_names') if r['local_language_id'] == EN}
    vg_order = {int(r['id']): int(r['order']) for r in fetch('version_groups')}

    learn = defaultdict(list)  # pid -> [(vg, move, level)]
    for r in fetch('pokemon_moves'):
        pid = int(r['pokemon_id'])
        if pid <= MAX_ID and r['pokemon_move_method_id'] == '1':
            learn[pid].append((int(r['version_group_id']), int(r['move_id']), int(r['level'] or 0)))

    # A "baby" added in a later generation than its evolution (Pichu → Pikachu)
    # doesn't count as a stage, as in the real TCG. Babies that debuted with
    # their evolution (Riolu → Lucario, Toxel → Toxtricity) do.
    def counts(parent, child):
        return parent['is_baby'] != '1' or parent['generation_id'] == child['generation_id']

    def stage(pid):
        s, cur = 0, species[pid]
        while cur['evolves_from_species_id']:
            parent = species.get(int(cur['evolves_from_species_id']))
            if not parent or not counts(parent, cur):
                break
            s += 1
            cur = parent
        return s

    def evolves_from(pid):
        f = species[pid]['evolves_from_species_id']
        if not f or int(f) > MAX_ID or not counts(species[int(f)], species[pid]):
            return 0
        return int(f)

    used_moves = {}
    out = []
    for pid in sorted(species):
        sp = species[pid]
        st = stats[pid]
        ts = types[pid]
        rows = learn[pid]
        latest = max((vg_order.get(vg, 0) for vg, _, _ in rows), default=0)
        cur = {}
        for vg, mid, lv in rows:
            if vg_order.get(vg, 0) == latest:
                cur[mid] = min(lv, cur.get(mid, 999))
        cands = []
        for mid, lv in cur.items():
            m = moves.get(mid)
            if not m or not m['power'] or m['damage_class_id'] == '1' or m['identifier'] in SKIP:
                continue
            if int(m['power']) < 20:
                continue
            cands.append((mid, lv, int(m['power']), TYPES[int(m['type_id'])], int(m['accuracy'] or 100)))
        stg = stage(pid)
        legendary = sp['is_legendary'] == '1' or sp['is_mythical'] == '1'
        cap = 100 if (stg == 2 or legendary) else 45 if stg == 1 else 32
        # weak attack: earliest-learned move with modest power (prefer STAB)
        weak = sorted([c for c in cands if c[2] <= 65] or cands,
                      key=lambda c: (c[3] not in ts, c[1], -c[2]))
        m1 = weak[0][0] if weak else 33  # Tackle fallback
        strong = sorted([c for c in cands if c[0] != m1 and c[1] <= cap] or [c for c in cands if c[0] != m1],
                        key=lambda c: -(c[2] * c[4] / 100 * (1.3 if c[3] in ts else 1)))
        m2 = strong[0][0] if strong else 0
        if m2 and moves[m2]['power'] and moves[m1]['power'] and int(moves[m2]['power']) < int(moves[m1]['power']):
            m1, m2 = m2, m1
        for mid in (m1, m2):
            if mid and mid not in used_moves:
                m, mm = moves[mid], meta.get(mid, {})
                used_moves[mid] = [move_names.get(mid, m['identifier']), TYPES[int(m['type_id'])], int(m['power'] or 40),
                                   AILMENTS.get(mm.get('meta_ailment_id', '0'), ''), int(mm.get('ailment_chance') or 0),
                                   int(mm.get('drain') or 0), int(mm.get('min_hits') or 0), int(mm.get('max_hits') or 0)]
        out.append([pid, names.get(pid, sp['identifier'].title()), ts[0], ts[1] if len(ts) > 1 else '',
                    st[1], st[2], st[3], st[4], st[5], st[6], evolves_from(pid),
                    1 if legendary else 0, 1 if sp['is_baby'] == '1' else 0, stg, m1, m2])

    js = ("'use strict';\n// GENERATED by tools/build_tcg_data.py from PokéAPI CSV data — do not edit by hand.\n"
          "// [id, name, type1, type2, hp, atk, def, spa, spd, spe, evolvesFromId, legendary, baby, stage, move1, move2]\n"
          "const TCG_SPECIES = [\n" + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in out) + "];\n"
          "// moveId: [name, type, power, ailment, ailmentChance, drain, minHits, maxHits]\n"
          "const TCG_MOVES = " + json.dumps(used_moves, ensure_ascii=False, separators=(',', ':')) + ";\n")
    os.makedirs('js/tcg', exist_ok=True)
    with open('js/tcg/data-species.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'wrote {len(out)} species, {len(used_moves)} moves, {len(js)//1024} KB', file=sys.stderr)


if __name__ == '__main__':
    main()
