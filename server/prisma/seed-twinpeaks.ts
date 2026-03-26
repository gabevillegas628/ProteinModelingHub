/**
 * Seed: Twin Peaks High School — 1BNA (B-DNA Dodecamer)
 *
 * Creates a realistic test group with:
 *   Student A (Laura Palmer)  — the hanger-on: logged in a handful of times,
 *                               barely touched the viewer, one submission
 *   Student B (Dale Cooper)   — the worker: frequent logins, hours in viewer,
 *                               multiple submissions and revisions, active in chat
 *
 * Run:  npx ts-node --esm prisma/seed-twinpeaks.ts
 *   or: npx tsx prisma/seed-twinpeaks.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a Date offset from now by the given number of days (negative = past) */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Return a Date offset from `base` by `minutes` minutes */
function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

/** Write a tiny placeholder file and return its generated filename */
function writePlaceholderFile(dir: string, label: string): { fileName: string; filePath: string; fileSize: number } {
  const filePath = `seed-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdb`;
  const fullPath = path.join(dir, filePath);
  fs.mkdirSync(dir, { recursive: true });
  const content = `REMARK  Seeded placeholder — ${label}\nEND\n`;
  fs.writeFileSync(fullPath, content);
  return { fileName: `${label}.pdb`, filePath, fileSize: content.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const UPLOAD_BASE = path.join(__dirname, '..', 'uploads');
  const MODELS_DIR = path.join(UPLOAD_BASE, 'models');
  const LITERATURE_DIR = path.join(UPLOAD_BASE, 'literature');
  const APPLICATIONS_DIR = path.join(UPLOAD_BASE, 'applications');

  [MODELS_DIR, LITERATURE_DIR, APPLICATIONS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

  // ------------------------------------------------------------------
  // 1. Application record (the paper trail of how they got in)
  // ------------------------------------------------------------------
  const pdfFilename = `seed-twinpeaks-${Date.now()}.pdf`;
  const pdfPath = path.join(APPLICATIONS_DIR, pdfFilename);
  // Write a minimal PDF-like placeholder so the file exists on disk
  fs.writeFileSync(pdfPath, '%PDF-1.4\n%%EOF\n');

  const application = await prisma.application.create({
    data: {
      status: 'APPROVED',
      wsspSchoolNumber: 'WA-0472',
      schoolName: 'Twin Peaks High School',
      studentAFirstName: 'Laura',
      studentALastName: 'Palmer',
      studentAEmail: 'laura.palmer@twinpeaks.edu',
      studentBFirstName: 'Dale',
      studentBLastName: 'Cooper',
      studentBEmail: 'dale.cooper@twinpeaks.edu',
      teacherName: 'Margaret Lanterman',
      teacherEmail: 'margaret.lanterman@twinpeaks.edu',
      cloneNumber: '42',
      proteinName: 'B-DNA Dodecamer',
      pdbAccessionNumber: '1BNA',
      sequenceIdentity: '100%',
      researchArticleCitation:
        'Wing R et al. (1980) Crystal structure analysis of a complete turn of B-DNA. Nature 287:755–758.',
      pdfFileName: 'Twin_Peaks_1BNA_Application.pdf',
      pdfFilePath: pdfFilename,
    },
  });
  console.log('✓ Application created:', application.id);

  // ------------------------------------------------------------------
  // 2. Student accounts (pre-approved, passwords set)
  // ------------------------------------------------------------------
  const passwordA = await bcrypt.hash('twinpeaks123', 12);
  const passwordB = await bcrypt.hash('twinpeaks123', 12);

  const studentA = await prisma.user.create({
    data: {
      email: 'laura.palmer@twinpeaks.edu',
      password: passwordA,
      firstName: 'Laura',
      lastName: 'Palmer',
      role: 'STUDENT',
      isApproved: true,
    },
  });

  const studentB = await prisma.user.create({
    data: {
      email: 'dale.cooper@twinpeaks.edu',
      password: passwordB,
      firstName: 'Dale',
      lastName: 'Cooper',
      role: 'STUDENT',
      isApproved: true,
    },
  });
  console.log('✓ Students created:', studentA.email, '|', studentB.email);

  // ------------------------------------------------------------------
  // 3. Group
  // ------------------------------------------------------------------
  const group = await prisma.group.create({
    data: {
      name: 'Twin Peaks High School - B-DNA Dodecamer',
      proteinPdbId: '1BNA',
      proteinName: 'B-DNA Dodecamer',
      wsspSchoolNumber: 'WA-0472',
      schoolName: 'Twin Peaks High School',
      cloneNumber: '42',
      sequenceIdentity: '100%',
      teacherName: 'Margaret Lanterman',
      teacherEmail: 'margaret.lanterman@twinpeaks.edu',
      researchArticleCitation:
        'Wing R et al. (1980) Crystal structure analysis of a complete turn of B-DNA. Nature 287:755–758.',
      // Set last review request to 5 days ago
      lastReviewRequestedAt: daysAgo(5),
    },
  });

  await prisma.groupMember.createMany({
    data: [
      { userId: studentA.id, groupId: group.id },
      { userId: studentB.id, groupId: group.id },
    ],
  });

  // Link the application
  await prisma.application.update({
    where: { id: application.id },
    data: { groupId: group.id },
  });
  console.log('✓ Group created:', group.name);

  // ------------------------------------------------------------------
  // 4. Model Templates — find or create the standard 3
  // ------------------------------------------------------------------
  const templateDefs = [
    { name: 'Model 1: Overall Structure', description: 'Full B-form helix, all atoms visible', orderIndex: 0 },
    { name: 'Model 2: Minor Groove', description: 'Minor groove highlighted with surface representation', orderIndex: 1 },
    { name: 'Model 3: Base Stacking', description: 'Base pairs shown in CPK coloring to illustrate stacking', orderIndex: 2 },
  ];

  const templates = await Promise.all(
    templateDefs.map(async (def) => {
      const existing = await prisma.modelTemplate.findFirst({ where: { name: def.name } });
      if (existing) return existing;
      return prisma.modelTemplate.create({ data: def });
    })
  );
  console.log('✓ Model templates ready:', templates.map(t => t.name).join(', '));

  // ------------------------------------------------------------------
  // 5. Submissions
  //
  // Cooper (B) did the heavy lifting:
  //   - Template 1: 3 revisions, final APPROVED
  //   - Template 2: 2 revisions, currently NEEDS_REVISION
  //   - Template 3: 1 draft (just started)
  //
  // Palmer (A) uploaded one submission on Template 1 that got superseded.
  // The DB keeps one record per group/template (latest wins via createdAt).
  // We model history by back-dating records; only the most recent one
  // (by updatedAt) is the "current" state shown in the UI.
  // ------------------------------------------------------------------

  // Template 1 — Overall Structure (APPROVED after back-and-forth)
  const t1 = templates[0];

  // Laura's early attempt — 25 days ago, quickly superseded
  await prisma.submission.create({
    data: {
      groupId: group.id,
      modelTemplateId: t1.id,
      submittedById: studentA.id,
      fileName: 'model1_draft_laura.pdb',
      filePath: writePlaceholderFile(MODELS_DIR, 'model1_draft_laura').filePath,
      fileSize: 42,
      status: 'NEEDS_REVISION',
      createdAt: daysAgo(25),
      updatedAt: daysAgo(24),
    },
  });

  // Dale's revision 1 — 22 days ago
  await prisma.submission.create({
    data: {
      groupId: group.id,
      modelTemplateId: t1.id,
      submittedById: studentB.id,
      fileName: 'model1_v2_cooper.pdb',
      filePath: writePlaceholderFile(MODELS_DIR, 'model1_v2_cooper').filePath,
      fileSize: 118,
      status: 'NEEDS_REVISION',
      createdAt: daysAgo(22),
      updatedAt: daysAgo(21),
    },
  });

  // Dale's revision 2 — 18 days ago
  await prisma.submission.create({
    data: {
      groupId: group.id,
      modelTemplateId: t1.id,
      submittedById: studentB.id,
      fileName: 'model1_v3_cooper.pdb',
      filePath: writePlaceholderFile(MODELS_DIR, 'model1_v3_cooper').filePath,
      fileSize: 134,
      status: 'APPROVED',
      createdAt: daysAgo(18),
      updatedAt: daysAgo(16),
    },
  });

  // Template 2 — Minor Groove (still under review)
  const t2 = templates[1];

  await prisma.submission.create({
    data: {
      groupId: group.id,
      modelTemplateId: t2.id,
      submittedById: studentB.id,
      fileName: 'model2_v1_cooper.pdb',
      filePath: writePlaceholderFile(MODELS_DIR, 'model2_v1_cooper').filePath,
      fileSize: 97,
      status: 'NEEDS_REVISION',
      createdAt: daysAgo(12),
      updatedAt: daysAgo(10),
    },
  });

  await prisma.submission.create({
    data: {
      groupId: group.id,
      modelTemplateId: t2.id,
      submittedById: studentB.id,
      fileName: 'model2_v2_cooper.pdb',
      filePath: writePlaceholderFile(MODELS_DIR, 'model2_v2_cooper').filePath,
      fileSize: 109,
      status: 'SUBMITTED',
      createdAt: daysAgo(7),
      updatedAt: daysAgo(7),
    },
  });

  // Template 3 — Base Stacking (just started, draft only)
  const t3 = templates[2];

  await prisma.submission.create({
    data: {
      groupId: group.id,
      modelTemplateId: t3.id,
      submittedById: studentB.id,
      fileName: 'model3_draft_cooper.pdb',
      filePath: writePlaceholderFile(MODELS_DIR, 'model3_draft_cooper').filePath,
      fileSize: 61,
      status: 'DRAFT',
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    },
  });

  console.log('✓ Submissions created');

  // ------------------------------------------------------------------
  // 6. Literature uploads
  // ------------------------------------------------------------------
  const litFile1 = writePlaceholderFile(LITERATURE_DIR, 'wing1980_bdna');
  const litFile2 = writePlaceholderFile(LITERATURE_DIR, 'drew1981_bdna_crystal');
  const litFile3 = writePlaceholderFile(LITERATURE_DIR, 'dickerson1982_sequence');

  await prisma.literature.createMany({
    data: [
      {
        groupId: group.id,
        uploadedById: studentB.id,
        title: 'Wing et al. (1980) — Crystal structure of a complete turn of B-DNA',
        fileName: 'Wing_1980_Nature.pdf',
        filePath: litFile1.filePath,
        fileSize: litFile1.fileSize,
        description: 'Primary reference — the original 1BNA crystal structure paper.',
        createdAt: daysAgo(28),
      },
      {
        groupId: group.id,
        uploadedById: studentB.id,
        title: 'Drew et al. (1981) — Structure of a B-DNA dodecamer at atomic resolution',
        fileName: 'Drew_1981_PNAS.pdf',
        filePath: litFile2.filePath,
        fileSize: litFile2.fileSize,
        description: 'High-resolution refinement — good for understanding minor groove geometry.',
        createdAt: daysAgo(20),
      },
      {
        groupId: group.id,
        uploadedById: studentA.id,
        title: 'Dickerson & Drew (1982) — Sequence-dependent helix geometry',
        fileName: 'Dickerson_1982_JMB.pdf',
        filePath: litFile3.filePath,
        fileSize: litFile3.fileSize,
        description: 'Useful for Model 2 — explains why certain base steps narrow the minor groove.',
        createdAt: daysAgo(14),
      },
    ],
  });
  console.log('✓ Literature uploaded');

  // ------------------------------------------------------------------
  // 7. Group chat messages
  // ------------------------------------------------------------------
  const chatMessages = [
    // Early days
    { userId: studentB.id, content: 'Hey Laura, I loaded 1BNA in JSmol — the helix is beautiful. Check it out when you have a chance!', createdAt: daysAgo(27) },
    { userId: studentA.id, content: 'Cool! I will look tonight.', createdAt: daysAgo(27) },
    { userId: studentB.id, content: 'I submitted Model 1 draft. Let me know what you think before I send it to the instructor.', createdAt: daysAgo(26) },
    { userId: studentA.id, content: 'Looks good to me 👍', createdAt: daysAgo(25) },
    // After feedback
    { userId: studentB.id, content: 'Got feedback on Model 1 — instructor wants the phosphate backbone highlighted separately. Reworking it now.', createdAt: daysAgo(21) },
    { userId: studentA.id, content: 'Oh ok. Want me to try anything?', createdAt: daysAgo(21) },
    { userId: studentB.id, content: 'Maybe read the Drew 1981 paper I uploaded? It explains the backbone geometry well.', createdAt: daysAgo(21) },
    // More Cooper solo work
    { userId: studentB.id, content: 'Resubmitting Model 1 with the backbone highlighted. Fingers crossed.', createdAt: daysAgo(18) },
    { userId: studentB.id, content: 'Model 1 approved! Starting on Model 2 (minor groove) now.', createdAt: daysAgo(16) },
    { userId: studentA.id, content: 'Nice!!!', createdAt: daysAgo(16) },
    { userId: studentB.id, content: 'Model 2 first attempt submitted. The groove width visualization was tricky — had to use a custom surface script.', createdAt: daysAgo(12) },
    { userId: studentB.id, content: 'Needs revision again. Instructor says the color scale for electrostatics needs a legend. Ugh.', createdAt: daysAgo(10) },
    { userId: studentA.id, content: 'ugh that sucks', createdAt: daysAgo(10) },
    { userId: studentB.id, content: 'Fixed it. Resubmitted Model 2. Also started roughing out Model 3.', createdAt: daysAgo(7) },
    { userId: studentB.id, content: 'Laura, we should probably both be in the viewer at the same time at some point so you can see what I did with the base stacking view.', createdAt: daysAgo(5) },
    { userId: studentA.id, content: 'Yeah for sure, maybe this weekend?', createdAt: daysAgo(4) },
    { userId: studentB.id, content: 'Sure. I will be on Saturday afternoon.', createdAt: daysAgo(4) },
    { userId: studentB.id, content: 'Draft of Model 3 is up — just needs polishing. Let me know if you want to co-work on it.', createdAt: daysAgo(3) },
  ];

  for (const msg of chatMessages) {
    await prisma.message.create({
      data: {
        groupId: group.id,
        userId: msg.userId,
        submissionId: null,
        content: msg.content,
        createdAt: msg.createdAt,
      },
    });
  }
  console.log('✓ Group chat messages created');

  // ------------------------------------------------------------------
  // 8. Login events
  //
  // Cooper: logged in almost every weekday for ~4 weeks
  // Palmer: logged in a handful of times
  // ------------------------------------------------------------------
  const cooperLoginDays = [28, 27, 26, 25, 22, 21, 20, 18, 17, 16, 15, 12, 10, 9, 7, 6, 5, 3, 2, 1];
  const palmerLoginDays = [27, 25, 16, 10, 4];

  await prisma.loginEvent.createMany({
    data: cooperLoginDays.map(d => ({ userId: studentB.id, createdAt: daysAgo(d) })),
  });
  await prisma.loginEvent.createMany({
    data: palmerLoginDays.map(d => ({ userId: studentA.id, createdAt: daysAgo(d) })),
  });
  console.log(`✓ Login events: Cooper ×${cooperLoginDays.length}, Palmer ×${palmerLoginDays.length}`);

  // ------------------------------------------------------------------
  // 9. Viewer sessions
  //
  // Cooper: long sessions most days he logged in
  // Palmer: two brief sessions — one with Cooper, one solo
  // ------------------------------------------------------------------
  type SessionSpec = { userId: string; startDaysAgo: number; durationMinutes: number };
  const sessionSpecs: SessionSpec[] = [
    // Dale — sustained viewer work across the project
    { userId: studentB.id, startDaysAgo: 27, durationMinutes: 48 },
    { userId: studentB.id, startDaysAgo: 26, durationMinutes: 62 },
    { userId: studentB.id, startDaysAgo: 25, durationMinutes: 35 },
    { userId: studentB.id, startDaysAgo: 22, durationMinutes: 74 },
    { userId: studentB.id, startDaysAgo: 21, durationMinutes: 55 },
    { userId: studentB.id, startDaysAgo: 20, durationMinutes: 41 },
    { userId: studentB.id, startDaysAgo: 18, durationMinutes: 88 },
    { userId: studentB.id, startDaysAgo: 16, durationMinutes: 30 },
    { userId: studentB.id, startDaysAgo: 15, durationMinutes: 67 },
    { userId: studentB.id, startDaysAgo: 12, durationMinutes: 95 },
    { userId: studentB.id, startDaysAgo: 10, durationMinutes: 50 },
    { userId: studentB.id, startDaysAgo:  9, durationMinutes: 38 },
    { userId: studentB.id, startDaysAgo:  7, durationMinutes: 72 },
    { userId: studentB.id, startDaysAgo:  6, durationMinutes: 44 },
    { userId: studentB.id, startDaysAgo:  5, durationMinutes: 29 },
    { userId: studentB.id, startDaysAgo:  3, durationMinutes: 56 },
    { userId: studentB.id, startDaysAgo:  2, durationMinutes: 33 },
    { userId: studentB.id, startDaysAgo:  1, durationMinutes: 21 },
    // Laura — two brief sessions
    { userId: studentA.id, startDaysAgo: 25, durationMinutes: 12 },  // glanced at Dale's work
    { userId: studentA.id, startDaysAgo:  4, durationMinutes: 8  },  // quick look-in
  ];

  await prisma.viewerSession.createMany({
    data: sessionSpecs.map(s => {
      const startedAt = daysAgo(s.startDaysAgo);
      return {
        userId: s.userId,
        groupId: group.id,
        startedAt,
        endedAt: minutesAfter(startedAt, s.durationMinutes),
      };
    }),
  });

  const cooperMinutes = sessionSpecs.filter(s => s.userId === studentB.id).reduce((a, s) => a + s.durationMinutes, 0);
  const palmerMinutes = sessionSpecs.filter(s => s.userId === studentA.id).reduce((a, s) => a + s.durationMinutes, 0);
  console.log(`✓ Viewer sessions: Cooper ${cooperMinutes}min total, Palmer ${palmerMinutes}min total`);

  // ------------------------------------------------------------------
  // 10. Done — print a summary
  // ------------------------------------------------------------------
  console.log('\n=== Twin Peaks seed complete ===');
  console.log(`Group:      ${group.name} (id: ${group.id})`);
  console.log(`Student A:  Laura Palmer <laura.palmer@twinpeaks.edu>  password: twinpeaks123`);
  console.log(`Student B:  Dale Cooper  <dale.cooper@twinpeaks.edu>   password: twinpeaks123`);
  console.log(`Teacher:    Margaret Lanterman <margaret.lanterman@twinpeaks.edu>`);
  console.log(`Protein:    1BNA — B-DNA Dodecamer`);
  console.log('\nEffort summary:');
  console.log(`  Cooper:  ${cooperLoginDays.length} logins, ${cooperMinutes}min viewer, 5 submissions, 2 lit uploads, ${chatMessages.filter(m => m.userId === studentB.id).length} messages`);
  console.log(`  Palmer:  ${palmerLoginDays.length} logins,  ${palmerMinutes}min viewer,  1 submission,  1 lit upload,  ${chatMessages.filter(m => m.userId === studentA.id).length} messages`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
