const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;

async function testKey(apiKey) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const result = await model.generateContent(
      "Say 'valid' if you can see this message"
    );
    const response = await result.response;
    const text = response.text();

    return true;
  } catch (error) {
    console.log(`Key failed: ${apiKey.substring(0, 10)}...`);
    console.log(`Error: ${error.message}\n`);
    return false;
  }
}

async function filterValidKeys() {
  try {
    const data = await fs.readFile('keys.json', 'utf8');
    const keysObject = JSON.parse(data);
    const keys = keysObject.geminiKeys;

    console.log(`Testing ${keys.length} keys...`);

    const results = await Promise.all(
      keys.map(async (key) => {
        const isValid = await testKey(key);
        return { key, isValid };
      })
    );

    const validKeys = results
      .filter((result) => result.isValid)
      .map((result) => result.key);

    const newKeysObject = { geminiKeys: validKeys };
    await fs.writeFile(
      'valid_keys.json',
      JSON.stringify(newKeysObject, null, 2)
    );

    console.log(`\nResults:`);
    console.log(`Original keys: ${keys.length}`);
    console.log(`Valid keys: ${validKeys.length}`);
    console.log(`Invalid keys: ${keys.length - validKeys.length}`);
    console.log('\nValid keys have been saved to valid_keys.json');
  } catch (error) {
    console.error('Script error:', error);
  }
}

filterValidKeys();
