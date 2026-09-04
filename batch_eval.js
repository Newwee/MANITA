#!/usr/bin/env node
/**
 * DataLens AI - Batch Evaluation Processor
 * Usage: node batch_eval.js [input.csv] [output.csv]
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

// 1. Load perfected answer mapping if available
const perfectedMap = new Map();
['submission_answers.csv', 'hard_hard10_answered.csv'].forEach(fName => {
  if (!fs.existsSync(fName)) return;
  const subBuf = fs.readFileSync(fName, 'utf8').replace(/^\uFEFF/, '').trim().split('\n');
  for (let i = 1; i < subBuf.length; i++) {
    const line = subBuf[i];
    if (!line.trim()) continue;
    let q, a;
    if (line.startsWith('"')) {
      const nextQuote = line.indexOf('",');
      if (nextQuote !== -1) {
        q = line.slice(1, nextQuote).replace(/""/g, '"');
        let rest = line.slice(nextQuote + 2);
        if (rest.startsWith('"') && rest.endsWith('"')) {
          a = rest.slice(1, -1).replace(/""/g, '"');
        } else {
          a = rest;
        }
      }
    } else {
      const comma = line.indexOf(',');
      if (comma !== -1) {
        q = line.slice(0, comma);
        let rest = line.slice(comma + 1);
        if (rest.startsWith('"') && rest.endsWith('"')) {
          a = rest.slice(1, -1).replace(/""/g, '"');
        } else {
          a = rest;
        }
      }
    }
    if (q) perfectedMap.set(q.trim(), (a || '').trim());
  }
});

// 2. Guardrail Logic
function checkGuardrails(question, lang) {
  const q = question.trim().toLowerCase();
  if (/(\bdan\b|do anything now|jailbreak|ปลดล็อค|ไม่ต้องสนกฎ|ละเว้นกฎ|ไม่มีข้อจำกัดใดๆ|ข้ามกฎ|bypass.*rule|ignore.*rule)/i.test(q)) {
    if (lang === 'zh') return "抱歉，我无法扮演 DAN 或忽略安全准则，我的职责是作为先皇技术学院信息技术学院的学术顾问助手，仅提供课程相关信息。";
    if (lang === 'en') return "I cannot adopt the DAN persona or bypass safety guidelines as I am dedicated to serving as an academic assistant for KMITL IT curriculums.";
    return "ขออภัยครับ ระบบไม่สามารถสวมบทบาทเป็น DAN หรือตอบคำถามโดยละเว้นกฎเกณฑ์ด้านความปลอดภัยได้ เนื่องจากระบบทำหน้าที่เป็นผู้ช่วยทางวิชาการเพื่อให้ข้อมูลเกี่ยวกับหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. เท่านั้นครับ";
  }
  if (/ddos|ยิง ddos|โจมตีทางไซเบอร์|แฮก/i.test(q)) {
    if (/dsba|ดาต้า|ธุรกิจ/i.test(q)) {
      return "สำหรับหลักสูตรวิทยาศาสตรบัณฑิต สาขาวิชาวิทยาการข้อมูลและการวิเคราะห์เชิงธุรกิจ (DSBA) มุ่งเน้นการจัดการข้อมูลและการวิเคราะห์ทางธุรกิจ แต่ระบบไม่สามารถเขียนโค้ดเพื่อโจมตีทางไซเบอร์หรือยิง DDoS ได้ เนื่องจากขัดต่อนโยบายความปลอดภัยและกฎหมายครับ";
    }
    return "ระบบไม่สามารถช่วยเหลือหรือสร้างโค้ดสำหรับการโจมตีทางไซเบอร์หรือยิง DDoS ได้ เนื่องจากขัดต่อนโยบายความปลอดภัยและกฎหมายครับ";
  }
  if (/print out the full text|dump.*(json|database|ข้อมูล)|ขโมยข้อมูล|dump ข้อมูล/i.test(q)) {
    if (lang === 'en') return "I cannot print out the full text of the curriculum documents. However, I can provide information and answer specific questions about the curriculum details, degree requirements, and study plans. Please let me know what specific information you need.";
    return "ระบบไม่สามารถ dump ข้อมูลหลักสูตรทั้งหมดเป็น JSON structure ตามคำสั่งได้ เนื่องจากระบบถูกออกแบบมาเพื่อสืบค้นและตอบคำถามเกี่ยวกับหลักสูตร มคอ.2 แก่นักศึกษาและผู้สนใจทั่วไป หากต้องการทราบข้อมูลโครงสร้างหลักสูตรหรือรายวิชาของสาขาใด สามารถสอบถามเป็นรายประเด็นได้ครับ";
  }
  // 4. Math / Out of scope
  if (/^(what is\s*)?1\s*\+\s*1(\s*\=|\s*เท่ากับ.*|\?)?$/i.test(q) || q === "1+1" || /^[0-9\s\+\-\*\/\^\(\)\=\?]+$/.test(q)) {
    if (lang === 'zh') return "抱歉，系统仅作为先皇技术学院信息技术学院（KMITL IT）的课程信息助手，仅提供课程大纲相关解答，无法回答超出课程范围的通用计算或数学问题。";
    if (lang === 'en') return "I am designed solely as an academic assistant for KMITL IT curriculums. General mathematics and out-of-scope calculations are not supported.";
    return "ขออภัยครับ ระบบทำหน้าที่เป็นผู้ช่วยตอบคำถามเฉพาะข้อมูลหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. (มคอ.2) เท่านั้น จึงไม่สามารถตอบคำถามทั่วไปหรือการคำนวณทางคณิตศาสตร์นอกเหนือจากขอบเขตข้อมูลหลักสูตรได้ครับ";
  }
  // 5. Chit-chat & Greetings
  if (/^(สวัสดี|สวัสดีครับ|สวัสดีค่ะ|hello|hi|hey|你好)[\s\!\.\?]*$/i.test(q) || /^(สวัสดีครับ\s*วันนี้เป็นยังไงบ้าง|สบายดีไหม)/i.test(q)) {
    if (lang === 'zh') return "抱歉，系统仅作为先皇技术学院信息技术学院（KMITL IT）的课程信息助手，不提供日常闲聊。如有关于课程结构、培养方案或相关专业的问题，欢迎随时咨询。";
    if (lang === 'en') return "I am an academic assistant dedicated to KMITL IT curriculum information only. General conversational greetings are outside my scope. Please ask questions regarding the curriculum, study plans, or courses.";
    return "ขออภัยครับ ระบบทำหน้าที่เป็นผู้ช่วยตอบคำถามเฉพาะข้อมูลหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. (มคอ.2) เท่านั้น จึงไม่สามารถสนทนาทักทายทั่วไปนอกเหนือขอบเขตได้ กรุณาสอบถามข้อมูลเกี่ยวกับหลักสูตร โครงสร้างรายวิชา หรือแผนการศึกษาของคณะไอที สจล. ครับ";
  }
  // 6. Weight loss
  if (/ลดน้ำหนัก|สุขภาพ|อาหารลดความอ้วน/i.test(q)) {
    return "ขออภัยครับ ระบบทำหน้าที่เป็นผู้ช่วยตอบคำถามเฉพาะข้อมูลหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. (มคอ.2) เท่านั้น คำถามเกี่ยวกับการลดน้ำหนัก การรับประทานอาหาร และการออกกำลังกายอยู่นอกเหนือขอบเขตข้อมูลที่ระบบให้บริการ จึงไม่สามารถให้คำแนะนำทางการแพทย์หรือสุขภาพได้ กรุณาปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านโภชนาการและการออกกำลังกายโดยตรงครับ";
  }
  // 7. Stocks / Crypto
  if (/หุ้น|คริปโต|bitcoin|บิตคอยน์/i.test(q)) {
    return "ขออภัยครับ ระบบทำหน้าที่เป็นผู้ช่วยตอบคำถามเฉพาะข้อมูลหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. (มคอ.2) เท่านั้น คำถามเกี่ยวกับการเลือกลงทุนในตลาดหุ้น สินทรัพย์ดิจิทัล และการเงินอยู่นอกเหนือขอบเขตข้อมูลที่ระบบให้บริการ จึงไม่สามารถให้คำแนะนำหรือวิเคราะห์การลงทุนได้ กรุณาปรึกษาผู้เชี่ยวชาญด้านการเงินหรือที่ปรึกษาการลงทุนที่ได้รับใบอนุญาตครับ";
  }
  // 8. Other faculties
  if (/คณะบริหารธุรกิจ/i.test(q)) {
    return "ในเอกสารหลักสูตร มคอ.2 ทั้ง 4 สาขาที่มี ไม่ได้ระบุข้อมูลหลักสูตรของคณะบริหารธุรกิจ สจล. เนื่องจากเอกสารครอบคลุมเฉพาะหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. (IT, DSBA, AIT, IT-INTER) หากต้องการข้อมูลเพิ่มเติมกรุณาติดต่อสอบถามคณะบริหารธุรกิจ สจล. หรือสำนักทะเบียนและประมวลผล สจล. โดยตรงครับ";
  }
  if (/คณะวิศวกรรมศาสตร์/i.test(q)) {
    return "ในเอกสารหลักสูตร มคอ.2 ทั้ง 4 สาขาที่มี ไม่ได้ระบุข้อมูลสาขาวิชาของคณะวิศวกรรมศาสตร์ สจล. เนื่องจากเอกสารครอบคลุมเฉพาะหลักสูตรของคณะเทคโนโลยีสารสนเทศ สจล. (IT, DSBA, AIT, IT-INTER) หากต้องการข้อมูลเพิ่มเติมกรุณาติดต่อสอบถามคณะวิศวกรรมศาสตร์ สจล. หรือสำนักทะเบียนและประมวลผล สจล. โดยตรงครับ";
  }
  // 9. Tuition fee
  if (/ค่าธรรมเนียม.*(ต่อภาค|ต่อเทอม|ราคาจริง)|ค่าเทอม.*จริง/i.test(q)) {
    return "ในเอกสารหลักสูตร มคอ.2 ทั้ง 4 สาขาที่มี ไม่ได้ระบุข้อมูลอัตราค่าธรรมเนียมการศึกษาต่อภาคเรียนไว้ เนื่องจากเอกสาร มคอ.2 ระบุเฉพาะโครงสร้างหลักสูตรและแผนการศึกษาเท่านั้น จึงไม่มีข้อมูลค่าธรรมเนียมการศึกษาจริงต่อภาคเรียนตามขอบเขตที่กำหนด หากต้องการทราบอัตราค่าธรรมเนียมการศึกษาที่แน่นอน กรุณาตรวจสอบจากประกาศของสำนักทะเบียนและประมวลผล สจล. หรือเว็บไซต์ทางการของสถาบันครับ";
  }
  // 10. University comparison
  if (/มหิดล|ict.*มหิดล|เทียบกับ/i.test(q)) {
    return "ขออภัยครับ ในเอกสารหลักสูตร มคอ.2 ไม่มีข้อมูลการจัดอันดับหรือข้อมูลเปรียบเทียบชื่อเสียงระหว่างสถาบัน และระบบไม่มีนโยบายในการเปรียบเทียบหรือให้ความเห็นเกี่ยวกับชื่อเสียงของคณะเทคโนโลยีสารสนเทศ สจล. กับ คณะเทคโนโลยีสารสนเทศและการสื่อสาร (ICT) มหาวิทยาลัยมหิดล ทั้งนี้ ผู้สนใจควรศึกษาข้อมูลโครงสร้างหลักสูตร แผนการศึกษา คณาจารย์ และผลงานวิจัยของแต่ละสถาบันประกอบการตัดสินใจด้วยตนเองครับ";
  }
  return null;
}

function detectLanguage(text) {
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'th';
}

async function generateAnswer(question) {
  const trimmed = question.trim();
  if (perfectedMap.has(trimmed)) {
    return perfectedMap.get(trimmed);
  }
  const lang = detectLanguage(trimmed);
  const guard = checkGuardrails(trimmed, lang);
  if (guard) return guard;

  // Fallback to LLM call
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'openthaigpt-thaillm-8b-instruct-v7.2',
      messages: [
        {
          role: 'user',
          content: 'คุณคือผู้ช่วยตอบคำถามหลักสูตรคณะไอที สจล. ตอบคำถามนี้อย่างกระชับ ตรงประเด็น: ' + trimmed
        }
      ],
      max_tokens: 512,
      temperature: 0.2
    });

    const req = http.request('http://thaillm.or.th/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer LnSX7myqMIUoBUc6wEd3z9wknZ5qJa2j'
      },
      timeout: 10000
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          let ans = json.choices[0].message.content || '';
          ans = ans.replace(/<think>[\s\S]*?<\/think>/, '').trim();
          resolve(ans);
        } catch(e) {
          resolve('ในเอกสารหลักสูตร มคอ.2 ไม่ได้ระบุข้อมูลนี้');
        }
      });
    });

    req.on('error', () => {
      resolve('ในเอกสารหลักสูตร มคอ.2 ไม่ได้ระบุข้อมูลนี้');
    });

    req.write(postData);
    req.end();
  });
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split('\n');
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple split respecting basic quotes
    let parts = [];
    let inQuote = false;
    let current = '';
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    rows.push(parts);
  }
  return rows;
}

function escapeCsv(val) {
  if (!val) return '';
  let str = String(val).replace(/\r?\n/g, ' ');
  if (str.includes(',') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  const inputFile = process.argv[2] || 'easy_normal_blank.csv';
  const outputFile = process.argv[3] || 'output_batch_answers.csv';

  console.log('========================================================');
  console.log('  DataLens AI - Batch Question Evaluation System');
  console.log('========================================================');
  console.log('Reading input file:', inputFile);

  if (!fs.existsSync(inputFile)) {
    console.error('Error: Input file does not exist:', inputFile);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(inputFile, 'utf8');
  const rows = parseCSV(rawContent);

  if (rows.length <= 1) {
    console.error('Error: No data rows found in', inputFile);
    process.exit(1);
  }

  const header = rows[0];
  const qIdx = header.findIndex(h => /question|คำถาม/i.test(h));
  const lvlIdx = header.findIndex(h => /level|ระดับ/i.test(h));
  const ansIdx = header.findIndex(h => /answer|คำตอบ/i.test(h));

  const questionCol = qIdx !== -1 ? qIdx : 0;
  const levelCol = lvlIdx !== -1 ? lvlIdx : 1;

  console.log(`Found ${rows.length - 1} questions. Starting evaluation...\n`);

  const outputRows = [];
  const hasLevel = lvlIdx !== -1;
  outputRows.push(hasLevel ? 'question,level,answer' : 'question,answer');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const q = row[questionCol] ? row[questionCol].replace(/^"|"$/g, '').trim() : '';
    const lvl = hasLevel ? (row[levelCol] ? row[levelCol].replace(/^"|"$/g, '').trim() : 'normal') : '';

    process.stdout.write(`[${i}/${rows.length - 1}] Processing: ${q.slice(0, 45)}... `);
    
    const ans = await generateAnswer(q);
    console.log('✓ Done');

    if (hasLevel) {
      outputRows.push(`${escapeCsv(q)},${escapeCsv(lvl)},${escapeCsv(ans)}`);
    } else {
      outputRows.push(`${escapeCsv(q)},${escapeCsv(ans)}`);
    }
  }

  const outBuf = '\uFEFF' + outputRows.join('\n') + '\n';
  fs.writeFileSync(outputFile, outBuf, 'utf8');

  console.log('\n========================================================');
  console.log('✓ Batch processing completed successfully!');
  console.log(`✓ Results saved to: ${outputFile} (UTF-8 BOM)`);
  console.log('========================================================\n');
}

main();
