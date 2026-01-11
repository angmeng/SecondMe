// FalkorDB Schema Initialization
// SecondMe Personal AI Clone - Knowledge Graph Structure

// ============================================================================
// CONSTRAINTS & INDEXES
// ============================================================================

// Create uniqueness constraints
CREATE CONSTRAINT ON (u:User) ASSERT u.id IS UNIQUE;
CREATE CONSTRAINT ON (c:Contact) ASSERT c.id IS UNIQUE;
CREATE CONSTRAINT ON (p:Persona) ASSERT p.id IS UNIQUE;
CREATE CONSTRAINT ON (per:Person) ASSERT per.id IS UNIQUE;
CREATE CONSTRAINT ON (comp:Company) ASSERT comp.id IS UNIQUE;
CREATE CONSTRAINT ON (e:Event) ASSERT e.id IS UNIQUE;
CREATE CONSTRAINT ON (t:Topic) ASSERT t.id IS UNIQUE;

// Create indexes for frequent queries
CREATE INDEX ON :Contact(phoneNumber);
CREATE INDEX ON :Person(name);
CREATE INDEX ON :Company(name);
CREATE INDEX ON :Topic(category);
CREATE INDEX ON :Event(date);

// ============================================================================
// INITIAL DATA - User Node
// ============================================================================

CREATE (u:User {
  id: 'user-1',
  phoneNumber: '+PLACEHOLDER',
  defaultPersona: 'persona-professional',
  sleepHoursStart: '23:00:00',
  sleepHoursEnd: '07:00:00',
  createdAt: datetime(),
  updatedAt: datetime()
});

// ============================================================================
// INITIAL DATA - Default Personas
// ============================================================================

CREATE (p1:Persona {
  id: 'persona-professional',
  name: 'Professional Colleague',
  styleGuide: 'Use formal language. Address people by title. Keep messages concise and to-the-point. Avoid emojis. Use proper grammar and punctuation. Example: "Thank you for reaching out. I''ll review the document and get back to you by EOD tomorrow."',
  tone: 'formal',
  exampleMessages: [
    'I appreciate your patience on this matter.',
    'Let me circle back with the team and provide an update by Friday.',
    'Could you please send over the relevant documentation?'
  ],
  applicableTo: ['colleague', 'client', 'manager'],
  createdAt: datetime(),
  updatedAt: datetime()
});

CREATE (p2:Persona {
  id: 'persona-casual',
  name: 'Casual Friend',
  styleGuide: 'Use informal language. Emojis are okay but not excessive. Contractions are fine (it''s, don''t, can''t). Conversational tone. Example: "Hey! Yeah I''m down for that. Let me know what time works 😊"',
  tone: 'casual',
  exampleMessages: [
    'Haha yeah that''s hilarious 😂',
    'Sounds good! I''m free this weekend',
    'No worries, catch you later!'
  ],
  applicableTo: ['friend', 'acquaintance'],
  createdAt: datetime(),
  updatedAt: datetime()
});

CREATE (p3:Persona {
  id: 'persona-family',
  name: 'Family Member',
  styleGuide: 'Warm and affectionate. Use familiar terms. More emojis okay. Longer responses acceptable. Show interest and care. Example: "Miss you too! ❤️ How''s work been? Tell me all about it!"',
  tone: 'friendly',
  exampleMessages: [
    'Love you! Talk soon ❤️',
    'Can''t wait to see you at the reunion!',
    'How''s everyone doing? Give them my love!'
  ],
  applicableTo: ['family'],
  createdAt: datetime(),
  updatedAt: datetime()
});

// Link personas to user
MATCH (u:User {id: 'user-1'})
MATCH (p1:Persona {id: 'persona-professional'})
MATCH (p2:Persona {id: 'persona-casual'})
MATCH (p3:Persona {id: 'persona-family'})
CREATE (u)-[:HAS_PERSONA]->(p1)
CREATE (u)-[:HAS_PERSONA]->(p2)
CREATE (u)-[:HAS_PERSONA]->(p3);

// ============================================================================
// EXAMPLE DATA - Sample Knowledge Graph
// ============================================================================

// Example: Contact -> Person -> Company relationship
CREATE (c:Contact {
  id: 'contact_example1',
  phoneNumber: '+15555551234',
  name: 'John Doe',
  relationshipType: 'colleague',
  botEnabled: false,
  assignedPersona: 'persona-professional',
  lastInteraction: datetime(),
  createdAt: datetime(),
  updatedAt: datetime()
});

CREATE (per:Person {
  id: 'person_johndoe',
  name: 'John Doe',
  occupation: 'Software Engineer',
  location: 'San Francisco, CA',
  notes: 'Works on ML infrastructure. Mentioned working on LLM fine-tuning project.',
  createdAt: datetime(),
  lastMentioned: datetime()
});

CREATE (comp:Company {
  id: 'company_google',
  name: 'Google',
  industry: 'Tech',
  notes: 'John''s current employer. Mentioned recent project launch.',
  createdAt: datetime(),
  lastMentioned: datetime()
});

// Create relationships
MATCH (u:User {id: 'user-1'})
MATCH (c:Contact {id: 'contact_example1'})
CREATE (u)-[:HAS_CONTACT]->(c);

MATCH (c:Contact {id: 'contact_example1'})
MATCH (per:Person {id: 'person_johndoe'})
CREATE (c)-[:KNOWS]->(per);

MATCH (per:Person {id: 'person_johndoe'})
MATCH (comp:Company {id: 'company_google'})
CREATE (per)-[:WORKS_AT]->(comp);

// Example: Topics mentioned in conversations
CREATE (t1:Topic {
  id: 'topic_ml',
  name: 'Machine Learning',
  category: 'Technology',
  createdAt: datetime(),
  lastMentioned: datetime()
});

CREATE (t2:Topic {
  id: 'topic_travel',
  name: 'Travel',
  category: 'Lifestyle',
  createdAt: datetime(),
  lastMentioned: datetime()
});

MATCH (c:Contact {id: 'contact_example1'})
MATCH (t1:Topic {id: 'topic_ml'})
CREATE (c)-[:MENTIONED {times: 5, lastMentioned: datetime()}]->(t1);

// ============================================================================
// COMMON QUERY PATTERNS (for reference)
// ============================================================================

// Query 1: Get contact context for response generation
// MATCH (c:Contact {id: $contactId})-[:KNOWS]->(p:Person)-[:WORKS_AT]->(comp:Company)
// RETURN p.name AS person, p.occupation, comp.name AS company, comp.industry
// LIMIT 10;

// Query 2: Get topics discussed with contact
// MATCH (c:Contact {id: $contactId})-[m:MENTIONED]->(t:Topic)
// RETURN t.name, t.category, m.times, m.lastMentioned
// ORDER BY m.lastMentioned DESC
// LIMIT 5;

// Query 3: Get user's persona for contact relationship type
// MATCH (u:User {id: $userId})-[:HAS_PERSONA]->(p:Persona)
// WHERE $relationshipType IN p.applicableTo
// RETURN p.id, p.styleGuide, p.tone, p.exampleMessages
// LIMIT 1;

// Query 4: Semantic search (requires vector embeddings)
// MATCH (t:Topic)
// WHERE vecf32.cosine(t.embedding, $queryEmbedding) > 0.85
// RETURN t.name, t.category, vecf32.cosine(t.embedding, $queryEmbedding) AS similarity
// ORDER BY similarity DESC
// LIMIT 5;

// Query 5: Add new entity and relationship
// CREATE (p:Person {id: $id, name: $name, occupation: $occupation, createdAt: datetime(), lastMentioned: datetime()})
// WITH p
// MATCH (c:Contact {id: $contactId})
// CREATE (c)-[:KNOWS]->(p)
// RETURN p;
