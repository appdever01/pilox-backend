const PDFDocument = require('pdfkit');
const axios = require('axios');
const fs = require('fs');
const stream = require('stream');
const { promisify } = require('util');
const OpenAI = require('openai');
const { getUuid, geminiHelper } = require('@helpers');
const finished = promisify(stream.finished);
const openai = new OpenAI();
const mjAPI = require('mathjax-node');
const SVGtoPDF = require('svg2pdf.js');

// Initialize MathJax
mjAPI.config({
  MathJax: {
    SVG: {
      font: 'TeX',
      minScale: 0.5,
      mtextFontInherit: true,
      linebreaks: { automatic: true },
      styles: {
        '.MathJax_SVG': {
          'font-size': '16px',
          margin: '1px 0',
        },
      },
    },
    TeX: {
      extensions: [
        'AMSmath.js',
        'AMSsymbols.js',
        'noErrors.js',
        'noUndefined.js',
      ],
    },
  },
});
mjAPI.start();

class pdfGenerator {
  constructor() {
    this.geminiHelper = new geminiHelper();
  }

  async generateContent(prompt, pages) {
    try {
      const structuredPrompt = `
        Generate a ${pages}-page document for the following prompt with appropriate tone & style: "${prompt}".
        
        Detect and match the appropriate style:
        - Story: narrative flow, characters, dialogue, plot
        - poetry: poetic, lyrical, rhythmic, emotional
        - Article: factual, researched, structured info
        - Course: educational, step-by-step, examples
        - Business: professional, structured, factual and realistic
        
        
        For each page return:
        {
            "page": number,
            "title": "Clear title",
            "content": "Well-written content with **key points in bold**. dont bold text too much, only the one that u feel needs emphasis" ,
            "imagePrompt": "Visual description matching content style"
        }

        Keep content organized, error-free, and properly formatted as valid JSON.
      `;

      const genAI = this.geminiHelper.generativeAI(
        this.geminiHelper.getNextApiKey()
      );
      const model = this.geminiHelper.getModel(genAI, 'gemini-2.0-flash-001');
      const result = await model.generateContent(structuredPrompt);
      const response = await result.response;
      const cleanedText = response
        .text()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const processed = await this.processAnalysisResponse(cleanedText);
      return processed;
    } catch (error) {
      console.error('Error generating content:', error);
      throw new Error('Failed to generate content');
    }
  }

  async processAnalysisResponse(text) {
    text = text.trim();
    try {
      const jsonResponse = JSON.parse(text);
      if (Array.isArray(jsonResponse)) {
        return jsonResponse.sort((a, b) => a.page - b.page);
      }
      const explanations = Object.entries(jsonResponse).map(([key, value]) => {
        const pageNum = parseInt(key.replace('page', '')) || value.page;
        return {
          page: pageNum,
          title: value.title || `Page ${pageNum}`,
          content: value.content || value,
          imagePrompt: value.imagePrompt || null,
        };
      });
      return explanations.sort((a, b) => a.page - b.page);
    } catch (parseError) {
      return this.handleParseError(text, parseError);
    }
  }

  async handleParseError(text) {
    const pageStructureRegex =
      /{\s*"page"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([^"]+)"\s*,\s*"imagePrompt"\s*:\s*"([^"]+)"\s*}/gs;
    const matches = [...text.matchAll(pageStructureRegex)];
    if (matches.length > 0) {
      const explanations = matches.map((match) => ({
        page: parseInt(match[1]),
        title: match[2].trim(),
        content: match[3].trim(),
        imagePrompt: match[4].trim(),
      }));

      return explanations.sort((a, b) => a.page - b.page);
    }
    const simplePageRegex =
      /page[:\s]+(\d+).*?title[:\s]+"([^"]+)".*?content[:\s]+"([^"]+)"/gis;
    const simpleMatches = [...text.matchAll(simplePageRegex)];
    if (simpleMatches.length > 0) {
      return simpleMatches
        .map((match) => ({
          page: parseInt(match[1]),
          title: match[2].trim(),
          content: match[3].trim(),
          imagePrompt: null,
        }))
        .sort((a, b) => a.page - b.page);
    }
    const fallbackResult = [
      {
        page: 1,
        title: 'Generated Content',
        content: text.trim(),
        imagePrompt: null,
      },
    ];
    return fallbackResult;
  }

  async generateImage(prompt) {
    try {
      const response = await openai.images.generate({
        model: 'dall-e-2',
        prompt: prompt,
        n: 1,
        size: '256x256',
      });
      if (response.data[0] && response.data[0].url) {
        const imageResponse = await axios.get(response.data[0].url, {
          responseType: 'arraybuffer',
        });
        return imageResponse.data;
      } else {
        throw new Error('Invalid image generation response');
      }
    } catch (error) {
      console.error('Error generating image:', error);
      throw new Error('Failed to generate image');
    }
  }

  async convertLatexToSVG(latex, displayMode = false) {
    try {
      const result = await mjAPI.typeset({
        math: latex,
        format: displayMode ? 'TeX' : 'inline-TeX',
        svg: true,
        ex: 8, // Increased size for better readability
        width: displayMode ? 1000 : 200, // Wider for display mode
        linebreaks: true,
        speakText: false,
        semantics: false,
        scale: 1.2, // Slightly larger scale
        styles: {
          g: {
            'stroke-width': '0.5px', // Crisper rendering
          },
        },
      });
      return result.svg;
    } catch (error) {
      console.error('LaTeX conversion error:', error);
      return null;
    }
  }

  async renderMathContent(doc, text, fontSize) {
    // Enhanced regex to catch more LaTeX patterns
    const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^$]+\$|\\[\(\[][\s\S]*?\\[\)\]])/g;
    let lastIndex = 0;
    let match;

    while ((match = mathRegex.exec(text)) !== null) {
      // Render text before math
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText) {
        doc.fontSize(fontSize).text(beforeText, { continued: false });
      }

      const mathText = match[0];
      const isDisplayMode = mathText.startsWith('$$');

      // Clean the LaTeX content
      let latex = mathText.replace(/\$\$|\$/g, '');
      latex = latex
        .replace(/\\sqrt/g, '\\sqrt{') // Auto-fix common sqrt syntax
        .replace(/([0-9a-zA-Z])\}/g, '$1}') // Close sqrt brackets
        .replace(/([^{])([\+\-])/g, '$1 $2 '); // Add spaces around operators

      const svg = await this.convertLatexToSVG(latex, isDisplayMode);

      if (svg) {
        if (isDisplayMode) {
          doc.moveDown(0.5);
          const xPos = (doc.page.width - (isDisplayMode ? 400 : 100)) / 2;
          await SVGtoPDF(doc, svg, xPos, doc.y, {
            width: isDisplayMode ? 400 : 100,
            preserveAspectRatio: true,
          });
          doc.moveDown(0.5);
        } else {
          const currentY = doc.y;
          await SVGtoPDF(doc, svg, doc.x, currentY - 2, {
            width: 60,
            preserveAspectRatio: true,
          });
          doc.moveUp().text(' ', { continued: true });
        }
      }

      lastIndex = mathRegex.lastIndex;
    }

    // Render remaining text
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      doc.fontSize(fontSize).text(remainingText, { continued: false });
    }
  }

  async createPDF(content, includeImages = false, customSettings = {}) {
    const {
      fontSize = 12,
      fontStyle = 'Helvetica',
      alignment = 'left',
      introText = '',
      endingNotes = '',
    } = customSettings;

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    const dir = './generated';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const pdfPath = `${dir}/${getUuid()}.pdf`;
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    const renderContent = async (text, options = {}) => {
      await this.renderMathContent(doc, text, options.fontSize || fontSize);
      doc.moveDown();
    };

    // Render intro text if present
    if (introText) {
      await renderContent(introText, {
        fontSize: fontSize + 4,
        align: alignment,
      });
    }

    // Render main content
    for (const page of content) {
      // Render title
      doc
        .font(`${fontStyle}-Bold`)
        .fontSize(fontSize + 4)
        .text(page.title, { align: 'center' });
      doc.moveDown();

      // Render page content
      await renderContent(page.content);

      if (page.page < content.length) {
        doc.addPage();
      }
    }

    // Render ending notes if present
    if (endingNotes) {
      if (content.length > 0) doc.addPage();
      await renderContent(endingNotes);
    }

    doc.end();
    await finished(writeStream);
    return pdfPath;
  }
}

module.exports = pdfGenerator;
