// @vitest-environment happy-dom
// tests/render-qa.test.ts
// A4 acceptance: no UI path renders the paraphrased curated `answer` without
// the "Curated summary (not verbatim)" label; the verbatim excerpt is always
// the primary answer, and the copy citation quotes the excerpt only.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ResultCard } from '../src/ui/ResultCard';
import { qaAnswerBlockHtml, CURATED_SUMMARY_LABEL } from '../src/ui/qa-block';
import type { QaRow } from '../src/engine/types';

const row: QaRow = {
  question: 'What is an agricultural holding?',
  answer: 'A holding is an economic unit of agricultural production under single management.',
  page_number: '37',
  section_title: 'Chapter 4: Concepts and Definitions',
  excerpt: 'An agricultural holding is a distinct economic unit of agricultural production under single management comprising all livestock kept and all land used for production.',
  tags: 'concepts|holding',
  confidence: 'high',
  embedding: [],
};

beforeAll(() => {
  // Keep the mobile-truncation branch out of the way.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addListener: () => {}, removeListener: () => {} }));
});

describe('A4 — verbatim answers on curated Q&A cards', () => {
  it('renderQA shows the excerpt as the primary answer with the labelled summary beneath it', () => {
    const card = ResultCard.renderQA({ row, score: 0.8 }, 'agricultural holding');

    // Badge renamed from "VERIFIED"/"ANSWER" to "Curated question"
    expect(card.querySelector('.verified-badge')!.textContent).toBe('Curated question');
    expect(card.querySelector('.match-badge--verified')!.textContent).toBe('curated');

    // The verbatim excerpt is the primary answer block
    const excerpt = card.querySelector('blockquote.qa-excerpt')!;
    expect(excerpt.textContent).toContain('distinct economic unit of agricultural production');

    // The paraphrase is present but subordinate and labelled
    const label = card.querySelector('.qa-summary-label')!;
    expect(label.textContent).toBe(CURATED_SUMMARY_LABEL);
    const summary = card.querySelector('.qa-summary')!;
    expect(summary.textContent).toContain('A holding is an economic unit');
    // Label sits before the summary in DOM order
    expect(label.compareDocumentPosition(summary as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Excerpt sits before the label in DOM order
    expect(excerpt.compareDocumentPosition(label as Node) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renderQA copy citation quotes the excerpt only, never the paraphrase', () => {
    const card = ResultCard.renderQA({ row, score: 0.8 }, 'agricultural holding');
    const citation = card.querySelector<HTMLButtonElement>('.copy-btn')!.dataset.citation!;
    expect(citation).toContain('Chapter 4: Concepts and Definitions');
    expect(citation).toContain('An agricultural holding is a distinct economic unit');
    expect(citation).not.toContain('A holding is an economic unit');
  });

  it('the Learn / self-test reveal block renders the excerpt first with the labelled summary', () => {
    const host = document.createElement('div');
    host.innerHTML = qaAnswerBlockHtml(row);

    const excerpt = host.querySelector('blockquote.qa-excerpt')!;
    expect(excerpt.textContent).toContain('distinct economic unit of agricultural production');

    const label = host.querySelector('.qa-summary-label')!;
    expect(label.textContent).toBe(CURATED_SUMMARY_LABEL);

    const summary = host.querySelector('.qa-summary')!;
    expect(summary.textContent).toContain('A holding is an economic unit');
    expect(
      label.compareDocumentPosition(summary as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      excerpt.compareDocumentPosition(label as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('no UI source renders row.answer without the summary label (static guard)', () => {
    // App.ts (Learn + self-test views) must only reach the paraphrase through
    // qaAnswerBlockHtml, which always emits the label.
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'ui', 'App.ts'), 'utf-8');
    expect(appSrc).not.toContain('row.answer');

    // ResultCard.ts renders row.answer only inside the labelled .qa-summary element.
    const rcSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'ui', 'ResultCard.ts'), 'utf-8');
    for (const line of rcSrc.split('\n')) {
      if (line.includes('row.answer')) {
        expect(line, `unlabelled answer render: ${line.trim()}`).toContain('qa-summary');
      }
    }
  });
});
