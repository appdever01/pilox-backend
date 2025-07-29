const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require('@google/generative-ai');
const GeminiFileManager = require('./GeminiFileManager');

class AIService {
  constructor(apiKeys) {
    this.apiKeys = apiKeys;
    this.currentKeyIndex = 0;
  }

  getNextApiKey() {
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  async analyzePdfWithGemini(
    pdfBuffer,
    isVideo = false,
    startPage = 1,
    endPage = null
  ) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GeminiFileManager(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const pdfjsLib = require('pdfjs-dist');
        const pdfDoc = await pdfjsLib.getDocument(pdfBuffer).promise;
        const totalPages = pdfDoc.numPages;
        const finalEndPage = endPage
          ? Math.min(endPage, totalPages)
          : totalPages;

        console.log(
          `Analyzing PDF pages ${startPage} to ${finalEndPage} (total pages: ${totalPages})`
        );

        const uploadResult = await fileManager.uploadFile(pdfBuffer, {
          mimeType: 'application/pdf',
        });

        let prompt;
        if (isVideo) {
          prompt = this.getOptimizedVideoPrompt(finalEndPage - startPage + 1);
        } else {
          prompt = this.getOptimizedPrompt(
            finalEndPage - startPage + 1,
            startPage,
            finalEndPage
          );
        }

        const result = await model.generateContent([
          {
            fileData: {
              fileUri: uploadResult.file.uri,
              mimeType: uploadResult.file.mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        console.log(response.text());
        return this.processAnalysisResponse(response.text());
      } catch (error) {
        console.error(`Attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts === maxAttempts) throw new Error('All API keys exhausted');
      }
    }
  }

  async processQuery(query, apiKey, history, pdfContext = '') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = this.getModel(genAI, 'gemini-2.0-flash-001');

    const formattedQuery = `
      Context from the PDF:
      ${pdfContext}

      Please format your response strictly in HTML tags like <br>, <p>, <i>, <ul>, etc. (avoid overuse). Format ur response in a very readable and eye catching format. Wrap the entire response in a div with class 'lecture-content'. Use <br> instead of /n for breaklines. Use LaTeX for math expressions, e.g. \\( x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\). Avoid using non-text tags like <img>. Keep the explanation simple.

      Original query: ${query}
    
      - Important: For any mathematical expressions, formulas, equations, etc: (you must use a valid MathJax expression)
        * Use single $ for inline math: $x^2$
        * Use double $$ for displayed equations: $$\\frac{a}{b}$$
        * Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
        * Common symbols: \\pm, \\times, \\div, \\leq, \\geq
    `;

    const recentHistory =
      history.messages.length > 5
        ? [history.messages[0], ...history.messages.slice(-5)]
        : history.messages;

    const formattedHistory = recentHistory.map((msg, index) => ({
      role: index % 2 === 0 ? 'user' : 'model',
      parts: [{ text: msg.toString() }],
    }));

    const chat = model.startChat({
      history: formattedHistory,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
      },
    });

    const result = await chat.sendMessage(formattedQuery);
    const response = result.response.text();

    return this.cleanResponse(response);
  }

  cleanResponse(response) {
    let cleanedResponse = response
      .replace(/```html\s*/, '')
      .replace(/```$/, '')
      .replace(/```\s*$/, '')
      .replace(/\s*```/, '')
      .trim();

    return cleanedResponse.includes('class="lecture-content"') ||
      cleanedResponse.includes("class='lecture-content'")
      ? cleanedResponse
      : `<div class='lecture-content'>${cleanedResponse}</div>`;
  }

  getModel(genAI, modelName) {
    return genAI.getGenerativeModel({
      model: modelName,
      safety_settings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });
  }

  getOptimizedPrompt(numPages, startPage, endPage) {
    console.log(numPages, startPage, endPage);
    return `Explain pages ${startPage} to ${endPage} of the document deeply and very explanatory in JSON format with valid HTML. Use <br>, <i>, and <div> etc for structure. Format ur response in a very readable and eye catching format. .

    IMPORTANT: Explain ALL ${numPages} pages in this format.. follow the range of pages you are given strictly.. if range is 1 page... just explain that page only:

    {
        "page${startPage}": "<div class='content'>Explain the page deeply and engagingly with examples using friendly tone</div>", 
        "page${startPage + 1}": "<div class='content'>Explain the page deeply and engagingly with examples using friendly tone</div>",
        ... continue for all pages from ${startPage} to ${endPage}
    }

    Don't add the page number in the response

    Key Requirements:
    - If thee pagee is more than 30pages, then you can reduce the length of the explanation for each page but still eexplain perfectly
    Must generate a json response for pages from ${startPage} to ${endPage}
    Important: Return json only response without \`\`\`json\\ around it pls
    - Avoid markdown like *, **, and non-text tags (img, video, audio)..
    - Don't ever add the '/n' in the response, just use <br> to break lines
    - For any mathematical expressions, formulas, equations, etc: (you must use a valid MathJax expression)
      * Use single $ for inline math: $x^2$
      * Use double $$ for displayed equations: $$\\frac{a}{b}$$
      * Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
      * Always double-escape backslashes in LaTeX commands:
       • Correct: \\\\frac, \\\\sqrt, \\\\pm
       • Wrong: \\frac, \\sqrt, \\pm
      * Common symbols: \\pm, \\times, \\div, \\leq, \\geq
    - Explain every page clearly,deeply and engagingly from top to bottom with all important points covered.
    - Maintain a friendly, understandable tone throughout.`;
  }

  getOptimizedVideoPrompt(numPages) {
    return `You are tasked with creating a video explainer for a PDF document. The goal is to present the content in an engaging manner, with a clear and concise explanation of each section or page. Follow these guidelines:
           Tone and Style:
            Use a conversational tone for general audiences: "Let me walk you through..."
            Use a professional tone for business documents: "This section highlights key findings on..."
            For academic content, adopt a mentor-like tone: "In this part, we explore...". 
            Use a friendly tone and make it more engaging and interesting, 

            IMPORTANT: The number of pages in the document is ${numPages}
            Please provide your explanation in this JSON format:
            {
                "page1": "I've structured this document to begin with [concept/topic]. My approach here was to... [Your explanation with appropriate tone]",
                "page2": "[Continue explaining with consistent tone]",
                ... continue for ALL the pages in the document
            }
            Explain each page individually, maintaining appropriate tone throughout

            Important: 
            - Try to explain the whole points in the !!shortest way!! possible without missing out any important points, and u must ensure the viewers understand the wholee concept deeply
            - Return only valid JSON with no tags or markdown like *, **, # or any symbols, brackets, 
            - Maintain consistent voice as the explainer
            - all scientific and technical sybols, fractions, operators should be called thier names not the symbols please!!! e.g 2^2 should be called two square or 2 to the power of 2
            - At the end, dont ask the user if they have any question, just say a greetings.
            `;
  }

  async processAnalysisResponse(text) {
    text = text.trim();

    try {
      const jsonResponse = JSON.parse(text);

      const explanations = Object.entries(jsonResponse).map(
        ([key, content]) => ({
          page: parseInt(key.replace('page', '')),
          content: content,
        })
      );

      return explanations.sort((a, b) => a.page - b.page);
    } catch (parseError) {
      return this.handleParseError(text, parseError);
    }
  }

  async handleParseError(text) {
    console.log('Attempting to extract content from malformed response...');

    const pageRegex = /"page(\d+)"\s*:\s*"(.*?)(?<!\\)"/gs;
    const matches = [...text.matchAll(pageRegex)];

    if (matches.length > 0) {
      console.log('Found content using regex');
      const explanations = matches.map((match) => ({
        page: parseInt(match[1]),
        content: match[2].trim(),
      }));

      return explanations.sort((a, b) => a.page - b.page);
    }

    const fallbackResult = [
      {
        page: 1,
        content: text.trim(),
      },
    ];
    console.log('Fallback Result:', JSON.stringify(fallbackResult, null, 2));
    return fallbackResult;
  }

  cleanHtmlContent(htmlContent) {
    // Remove all HTML tags
    let cleanText = htmlContent.replace(/<[^>]*>/g, '');
    cleanText = cleanText
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    return cleanText;
  }

  async extractKeywords(explanations) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;
    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const combinedText = explanations.map((exp) => exp.content).join(' ');
        const cleanedText = this.cleanHtmlContent(combinedText);
        const prompt = `Understand fully the content of this pdf content and extract 5-10 most important educational keywords or phrases from this text that would be useful for finding relevant educational videos from youtube. Focus on main concepts and topics. Return only the keywords separated by commas, nothing else: ${cleanedText}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const keywords = response
          .text()
          .split(',')
          .map((k) => k.trim());
        return keywords;
      } catch (error) {
        console.error('Keyword extraction error:', error);
        console.error(`Attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts === maxAttempts) return [];
      }
    }
  }

  async generateQuiz(pdfBuffer, numQuestions, startPage = 1, endPage = null) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;
    const questionCount = parseInt(numQuestions) || 10;

    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GeminiFileManager(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const uploadResult = await fileManager.uploadFile(pdfBuffer, {
          mimeType: 'application/pdf',
        });

        const prompt = `As an educational expert, create a comprehensive quiz based on pages ${startPage} to ${endPage || 'end'} of this document. Generate STRICTLY ${questionCount} questions that test different levels of understanding (recall, comprehension, application, and analysis).

        Format the response as a JSON array with this structure (IMPORTANT: correctAnswer must be a number 0-3 representing the index of the correct option):
        {
          "questions": [
            {
              "question": "The question text",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": 0,
              "explanation": "Brief and detailed explanation of why this is correct (you must use a valid MathJax expression to render math expressions)",
              "page": number
            }
          ]
        }

        Important: 
        1. IMPORTANT: correctAnswer MUST be a number (0-3) representing the index of the correct option
        2. Each question must have exactly 4 options
        3. Return ONLY valid JSON, no markdown or other text
        4. Make sure all JSON properties are properly quoted
        5. Ensure proper nesting of brackets and braces
        6. Do not make the correct answer always one particular option
        7. Do not use special characters or escape sequences in the text
        8. Use simple quotes for strings
        9. Include the page number where the question content is from

        - Important: For any mathematical expressions, formulas, equations, etc: (you must use a valid MathJax expression)
          * Use single $ for inline math: $x^2$
          * Use double $$ for displayed equations: $$\\frac{a}{b}$$
          * Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
          * Common symbols: \\pm, \\times, \\div, \\leq, \\geq
        `;

        const result = await model.generateContent([
          {
            fileData: {
              fileUri: uploadResult.file.uri,
              mimeType: uploadResult.file.mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        let text = response.text().trim();

        text = text
          .replace(/```json\s*|\s*```/g, '')
          .replace(/\n\s*/g, ' ')
          .replace(/([A-D])\)/g, '')
          .replace(/\\([^"\\])/g, '$1')
          .replace(/\t/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        try {
          const parsedQuiz = JSON.parse(text);

          if (!parsedQuiz.questions || !Array.isArray(parsedQuiz.questions)) {
            throw new Error('Invalid quiz structure');
          }

          const transformedQuiz = {
            questions: parsedQuiz.questions.map((q) => ({
              question: q.question,
              options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
              correctAnswer:
                typeof q.correctAnswer === 'string'
                  ? parseInt(q.correctAnswer) || 0
                  : typeof q.correctAnswer === 'number'
                    ? q.correctAnswer
                    : 0,
              explanation: q.explanation || 'No explanation provided',
              page: q.page,
            })),
          };

          return transformedQuiz;
        } catch (parseError) {
          console.error('Parse error:', parseError);
          console.error('Response text:', text);
          throw new Error('Failed to parse quiz response');
        }
      } catch (error) {
        console.error(`Quiz generation attempt ${attempts + 1} failed:`, error);
        attempts++;
        if (attempts === maxAttempts) {
          return {
            questions: [
              {
                question:
                  "We couldn't generate a full quiz. Here's a sample question:",
                options: [
                  'Please try again',
                  'Contact support if this persists',
                  'Check your connection',
                  'All of the above',
                ],
                correctAnswer: 3,
                explanation: 'We apologize for the technical difficulty.',
                page: startPage,
              },
            ],
          };
        }
      }
    }
  }

  async generateFlashCard(
    pdfBuffer,
    numQuestions,
    startPage = 1,
    endPage = null
  ) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GeminiFileManager(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const uploadResult = await fileManager.uploadFile(pdfBuffer, {
          mimeType: 'application/pdf',
        });

        const prompt = `As an educational expert, generate ${numQuestions} flashcards from pages ${startPage} to ${endPage || 'end'} of this document that cover the key concepts and important points.

        Format the response as a JSON array with this structure:
        {
          "questions": [
            {
              "question": "Clear, concise question about the content concept",
              "answer": "Detailed explanation of the answer (limit to 120 characters) and use a valid MathJax expression to render math expressions",
              "page": number
            }
          ]
        }

        Guidelines:
        1. Questions should be clear and focused on one concept
        2. Include a mix of definition, concept, and application questions
        3. Progress from basic to advanced concepts
        4. Return ONLY valid JSON, no markdown or other text
        5. Include the page number where the content is from

        For mathematical expressions:
        * Use single $ for inline math: $x^2$
        * Use double $$ for displayed equations: $$\\frac{a}{b}$$
        * Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
        * Common symbols: \\pm, \\times, \\div, \\leq, \\geq`;

        const result = await model.generateContent([
          {
            fileData: {
              fileUri: uploadResult.file.uri,
              mimeType: uploadResult.file.mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        const text = response.text().trim();
        const cleanedText = text
          .replace(/```json\s*|\s*```/g, '')
          .replace(/\n\s*/g, ' ')
          .trim();

        const parsedQuiz = JSON.parse(cleanedText);

        const transformedQuiz = {
          questions: parsedQuiz.questions.map((q) => ({
            question: q.question,
            answer: q.answer,
            page: q.page || startPage,
          })),
        };

        return transformedQuiz;
      } catch (error) {
        console.error(
          `Flash card generation attempt ${attempts + 1} failed:`,
          error
        );
        attempts++;
        if (attempts === maxAttempts) {
          return {
            questions: [
              {
                question: "We couldn't generate flashcards. Please try again.",
                answer: 'Technical difficulty occurred.',
                page: startPage,
              },
            ],
          };
        }
      }
    }
  }

  async processQuizResponse(text) {
    try {
      const jsonResponse = JSON.parse(text);
      return jsonResponse;
    } catch (parseError) {
      console.error(
        'Attempting to extract quiz from malformed response',
        parseError
      );
      return this.handleQuizParseError(text);
    }
  }

  handleQuizParseError(text) {
    // Remove any markdown code block indicators
    text = text.replace(/```json\s*|\s*```/g, '');

    try {
      // Try parsing again after cleanup
      return JSON.parse(text);
    } catch (error) {
      console.log('Error parsing quiz response:', error);
      // If still can't parse, create a fallback quiz
      return {
        questions: [
          {
            question:
              "We couldn't generate a full quiz. Here's a sample question:",
            options: [
              'Please try again',
              'Contact support if this persists',
              'Check your connection',
              'All of the above',
            ],
            correctAnswer: 3,
            explanation: 'We apologize for the technical difficulty.',
          },
        ],
      };
    }
  }

  async generateTrueFalse(
    pdfBuffer,
    numQuestions,
    startPage = 1,
    endPage = null
  ) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;
    const questionCount = parseInt(numQuestions) || 10;

    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GeminiFileManager(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const uploadResult = await fileManager.uploadFile(pdfBuffer, {
          mimeType: 'application/pdf',
        });

        const prompt = `Generate ${questionCount} true/false questions from pages ${startPage} to ${endPage || 'end'} of this document.

        For any mathematical expressions, formulas, equations, or technical symbols:
        - Use single $ for inline math: $x^2$
        - Use double $$ for displayed equations: $$\\frac{a}{b}$$
        - Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
        - Common symbols: \\pm, \\times, \\div, \\leq, \\geq
        - Chemical formulas: $H_2O$, $CO_2$
        - Units: $m/s^2$, $\\text{kg}\\cdot\\text{m}/\\text{s}^2$

        Format as JSON:
        {
          "questions": [
            {
              "question": "Statement to evaluate (with proper MathJax formatting)",
              "correctAnswer": boolean,
              "explanation": "Why true/false with reference to content",
              "page": number
            }
          ]
        }

        Guidelines:
        1. Questions should test understanding
        2. Mix of true and false statements
        3. Clear explanations referencing content
        4. Use proper MathJax for all mathematical/technical expressions
        5. Return ONLY valid JSON`;

        const result = await model.generateContent([
          {
            fileData: {
              fileUri: uploadResult.file.uri,
              mimeType: uploadResult.file.mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        const text = response.text().trim();
        const cleanedText = text
          .replace(/```json\s*|\s*```/g, '')
          .replace(/\n\s*/g, ' ')
          .trim();

        const parsedQuestions = JSON.parse(cleanedText);
        return parsedQuestions;
      } catch (error) {
        console.error(
          `True/False generation attempt ${attempts + 1} failed:`,
          error
        );
        attempts++;
        if (attempts === maxAttempts) {
          return {
            questions: [
              {
                question: "We couldn't generate questions. Please try again.",
                correctAnswer: true,
                explanation: 'Technical difficulty occurred.',
                page: startPage,
              },
            ],
          };
        }
      }
    }
  }

  async generateTheoryQuestions(
    pdfBuffer,
    numQuestions,
    startPage = 1,
    endPage = null
  ) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;
    const questionCount = parseInt(numQuestions) || 5;

    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GeminiFileManager(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const uploadResult = await fileManager.uploadFile(pdfBuffer, {
          mimeType: 'application/pdf',
        });

        const prompt = `Generate ${questionCount} theory questions from pages ${startPage} to ${endPage || 'end'} of this document. Use html proper tags to format the questions and answers.

        For any mathematical expressions, formulas, equations, or technical symbols:
        - Use single $ for inline math: $x^2$
        - Use double $$ for displayed equations: $$\\frac{a}{b}$$
        - Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
        - Common symbols: \\pm, \\times, \\div, \\leq, \\geq
        - Chemical formulas: $H_2O$, $CO_2$
        - Units: $m/s^2$, $\\text{kg}\\cdot\\text{m}/\\text{s}^2$

        Format as JSON:
        {
          "questions": [
            {
              "question": "Detailed theory question (with proper MathJax formatting)",
              "modelAnswer": "model answer from the pdf with reference (with proper MathJax formatting). just make it brief but detailed.. not too long",
              "page": number
            }
          ]
        }

        Guidelines:
        1. Questions should require detailed explanations
        2. Model answers should be explanatory
        3. Include 3-5 key points for each answer
        4. Use proper MathJax for all mathematical/technical expressions and remove markdowns
        5. Return ONLY valid JSON`;

        const result = await model.generateContent([
          {
            fileData: {
              fileUri: uploadResult.file.uri,
              mimeType: uploadResult.file.mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        const text = response.text().trim();
        const cleanedText = text
          .replace(/```json\s*|\s*```/g, '')
          .replace(/\n\s*/g, ' ')
          .trim();

        const parsedResponse = JSON.parse(cleanedText);

        // Validate the structure
        if (
          !parsedResponse.questions ||
          !Array.isArray(parsedResponse.questions)
        ) {
          throw new Error('Invalid response structure');
        }

        return parsedResponse;
      } catch (error) {
        console.error(
          `Theory questions generation attempt ${attempts + 1} failed:`,
          error
        );
        attempts++;
        if (attempts === maxAttempts) {
          return {
            questions: [
              {
                question: "We couldn't generate questions. Please try again.",
                modelAnswer: 'Technical difficulty occurred.',
                page: startPage,
              },
            ],
          };
        }
      }
    }
  }

  async verifyTheoryAnswer(pdfBuffer, question, userAnswer) {
    let attempts = 0;
    const maxAttempts = this.apiKeys.length;

    while (attempts < maxAttempts) {
      try {
        const apiKey = this.getNextApiKey();
        const genAI = new GoogleGenerativeAI(apiKey);
        const fileManager = new GeminiFileManager(apiKey);
        const model = this.getModel(genAI, 'gemini-2.0-flash-001');

        const uploadResult = await fileManager.uploadFile(pdfBuffer, {
          mimeType: 'application/pdf',
        });

        const prompt = `Evaluate this theory answer based on the PDF content.
        
        Question: ${question.question}
        Model Answer: ${question.modelAnswer}
        User Answer: ${userAnswer}

        For any mathematical expressions in your response:
        - Use single $ for inline math: $x^2$
        - Use double $$ for displayed equations: $$\\frac{a}{b}$$
        - Always escape backslashes in LaTeX: \\frac, \\sqrt, etc.
        - Common symbols: \\pm, \\times, \\div, \\leq, \\geq
        - Chemical formulas: $H_2O$, $CO_2$
        - Units: $m/s^2$, $\\text{kg}\\cdot\\text{m}/\\text{s}^2$

        Return evaluation as JSON:
        {
          "score": number (0-100),
          "feedback": "Detailed feedback with specific points on what was good and what could be improved. Dont say 'the use said...' just say 'Your response was...' use direct pronoun",
          "correctAnswer": "The complete correct answer with proper formatting, proper mathjax expressions and well explained"
        }`;

        const result = await model.generateContent([
          {
            fileData: {
              fileUri: uploadResult.file.uri,
              mimeType: uploadResult.file.mimeType,
            },
          },
          prompt,
        ]);

        const response = await result.response;
        const text = response.text().trim();
        const cleanedText = text
          .replace(/```json\s*|\s*```/g, '')
          .replace(/\n\s*/g, ' ')
          .trim();

        return JSON.parse(cleanedText);
      } catch (error) {
        console.error(
          `Answer verification attempt ${attempts + 1} failed:`,
          error
        );
        attempts++;
        if (attempts === maxAttempts) {
          return {
            score: 0,
            feedback:
              "We couldn't verify your answer due to technical difficulties. Please try again later.",
            correctAnswer: question.modelAnswer,
          };
        }
      }
    }
  }
}

module.exports = AIService;
