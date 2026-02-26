/**
 * Task Definitions - Sample evaluation tasks
 */

import type { TaskDefinition, EvalSuite } from "../types";

// ============================================
// TASK 1: Flight Search
// ============================================

export const flightSearchTask: TaskDefinition = {
    id: "TASK_001",
    name: "Flight Search with Filters",
    description: "Search for a one-way flight with specific filters and select the cheapest option",
    category: "search-filter",
    instruction: `Search for a one-way flight from San Francisco (SFO) to New York (JFK) on March 15, 2026. 
Filter results to show only non-stop flights departing between 6 AM and 12 PM. 
Select the cheapest available option and proceed to the booking details page (do not complete the purchase).`,
    startingUrl: "https://www.google.com/travel/flights",
    structuredInputs: {
        origin: "SFO",
        destination: "JFK",
        date: "2026-03-15",
        tripType: "one-way",
        stops: "non-stop",
        departureTimeStart: "06:00",
        departureTimeEnd: "12:00",
        sortBy: "price_low_to_high",
    },
    successCriteria: {
        urlContains: "booking",
        domElements: [
            { selector: "[data-origin='SFO']", exists: true },
            { selector: "[data-destination='JFK']", exists: true },
        ],
    },
    subGoals: [
        {
            id: "sg_origin",
            name: "Origin Entered",
            description: "Successfully entered SFO as the origin airport",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "[data-origin]", text: "SFO" } },
        },
        {
            id: "sg_destination",
            name: "Destination Entered",
            description: "Successfully entered JFK as the destination airport",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "[data-destination]", text: "JFK" } },
        },
        {
            id: "sg_date",
            name: "Date Selected",
            description: "Selected March 15, 2026 as the departure date",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "[data-date]", text: "Mar 15" } },
        },
        {
            id: "sg_search",
            name: "Search Executed",
            description: "Successfully executed the flight search",
            weight: 0.15,
            verification: { type: "url", urlContains: "/flights/search" },
        },
        {
            id: "sg_nonstop",
            name: "Non-stop Filter Applied",
            description: "Filtered to show only non-stop flights",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "[data-stops='0']", exists: true } },
        },
        {
            id: "sg_selected",
            name: "Flight Selected",
            description: "Selected a flight from the results",
            weight: 0.15,
            verification: { type: "url", urlContains: "/booking" },
        },
        {
            id: "sg_booking_page",
            name: "Booking Page Reached",
            description: "Reached the booking details page",
            weight: 0.10,
            verification: { type: "url", urlPattern: "/booking/details" },
        },
    ],
    limits: {
        maxActions: 30,
        maxTimeSeconds: 300,
        maxLLMCalls: 20,
    },
};

// ============================================
// TASK 2: E-commerce Product Search
// ============================================

export const productSearchTask: TaskDefinition = {
    id: "TASK_002",
    name: "E-commerce Product Search and Filter",
    description: "Search for a product and apply filters on an e-commerce site",
    category: "e-commerce",
    instruction: `Go to Amazon and search for "wireless noise cancelling headphones". 
Filter the results to show only items with 4+ star ratings and Prime delivery. 
Sort by price low to high and add the first result to your cart.`,
    startingUrl: "https://www.amazon.com",
    structuredInputs: {
        searchQuery: "wireless noise cancelling headphones",
        minRating: 4,
        primeOnly: true,
        sortBy: "price_low_to_high",
    },
    successCriteria: {
        urlContains: "cart",
        domElements: [{ selector: "#nav-cart-count", exists: true }],
    },
    subGoals: [
        {
            id: "sg_search",
            name: "Search Executed",
            description: "Entered search query and executed search",
            weight: 0.20,
            verification: { type: "url", urlContains: "k=wireless" },
        },
        {
            id: "sg_rating_filter",
            name: "Rating Filter Applied",
            description: "Applied 4+ star rating filter",
            weight: 0.20,
            verification: { type: "dom", domCheck: { selector: "[data-filter='rating']", exists: true } },
        },
        {
            id: "sg_prime_filter",
            name: "Prime Filter Applied",
            description: "Applied Prime delivery filter",
            weight: 0.20,
            verification: { type: "url", urlContains: "prime" },
        },
        {
            id: "sg_sort",
            name: "Sorted by Price",
            description: "Sorted results by price low to high",
            weight: 0.15,
            verification: { type: "url", urlContains: "sort=price" },
        },
        {
            id: "sg_added_to_cart",
            name: "Added to Cart",
            description: "Successfully added item to cart",
            weight: 0.25,
            verification: { type: "url", urlContains: "cart" },
        },
    ],
    limits: {
        maxActions: 25,
        maxTimeSeconds: 180,
        maxLLMCalls: 15,
    },
};

// ============================================
// TASK 3: Form Filling
// ============================================

export const formFillingTask: TaskDefinition = {
    id: "TASK_003",
    name: "Contact Form Submission",
    description: "Fill out and submit a contact form with provided information",
    category: "form-filling",
    instruction: `Navigate to the contact page and fill out the form with the following information:
- Name: John Smith
- Email: john.smith@example.com
- Subject: Product Inquiry
- Message: I would like to learn more about your enterprise pricing options. Please contact me at your earliest convenience.

Submit the form and verify the confirmation message appears.`,
    startingUrl: "https://example.com/contact",
    structuredInputs: {
        name: "John Smith",
        email: "john.smith@example.com",
        subject: "Product Inquiry",
        message: "I would like to learn more about your enterprise pricing options. Please contact me at your earliest convenience.",
    },
    successCriteria: {
        domElements: [
            { selector: ".success-message", exists: true },
            { selector: ".confirmation", text: "Thank you" },
        ],
    },
    subGoals: [
        {
            id: "sg_navigate",
            name: "Navigated to Contact Page",
            description: "Successfully navigated to the contact page",
            weight: 0.10,
            verification: { type: "url", urlContains: "/contact" },
        },
        {
            id: "sg_name",
            name: "Name Filled",
            description: "Entered name in the form",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "input[name='name']", attribute: { name: "value", value: "John Smith" } } },
        },
        {
            id: "sg_email",
            name: "Email Filled",
            description: "Entered email in the form",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "input[name='email']", attribute: { name: "value", value: "john.smith@example.com" } } },
        },
        {
            id: "sg_subject",
            name: "Subject Filled",
            description: "Entered subject in the form",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "input[name='subject']", exists: true } },
        },
        {
            id: "sg_message",
            name: "Message Filled",
            description: "Entered message in the form",
            weight: 0.15,
            verification: { type: "dom", domCheck: { selector: "textarea[name='message']", exists: true } },
        },
        {
            id: "sg_submitted",
            name: "Form Submitted",
            description: "Successfully submitted the form",
            weight: 0.30,
            verification: { type: "dom", domCheck: { selector: ".success-message", exists: true } },
        },
    ],
    limits: {
        maxActions: 15,
        maxTimeSeconds: 120,
        maxLLMCalls: 10,
    },
};

// ============================================
// TASK 4: Data Extraction
// ============================================

export const dataExtractionTask: TaskDefinition = {
    id: "TASK_004",
    name: "Wikipedia Data Extraction",
    description: "Navigate to Wikipedia and extract specific information",
    category: "data-extraction",
    instruction: `Go to Wikipedia and search for "Python programming language". 
Extract the following information:
1. The year Python was first released
2. The original creator's name
3. The current stable version number

Report these findings.`,
    startingUrl: "https://en.wikipedia.org",
    structuredInputs: {
        searchQuery: "Python programming language",
        fieldsToExtract: "releaseYear,creator,stableVersion",
    },
    successCriteria: {
        urlContains: "Python_(programming_language)",
    },
    subGoals: [
        {
            id: "sg_search",
            name: "Search Executed",
            description: "Searched for Python on Wikipedia",
            weight: 0.20,
            verification: { type: "url", urlContains: "search" },
        },
        {
            id: "sg_navigate",
            name: "Article Found",
            description: "Navigated to the Python article",
            weight: 0.20,
            verification: { type: "url", urlContains: "Python_(programming_language)" },
        },
        {
            id: "sg_extract_year",
            name: "Release Year Extracted",
            description: "Found and extracted the release year",
            weight: 0.20,
            verification: { type: "custom", customFn: "verifyYearExtracted" },
        },
        {
            id: "sg_extract_creator",
            name: "Creator Extracted",
            description: "Found and extracted the creator name",
            weight: 0.20,
            verification: { type: "custom", customFn: "verifyCreatorExtracted" },
        },
        {
            id: "sg_extract_version",
            name: "Version Extracted",
            description: "Found and extracted the stable version",
            weight: 0.20,
            verification: { type: "custom", customFn: "verifyVersionExtracted" },
        },
    ],
    limits: {
        maxActions: 20,
        maxTimeSeconds: 180,
        maxLLMCalls: 12,
    },
};

// ============================================
// TASK 5: Multi-step Navigation
// ============================================

export const multiStepNavigationTask: TaskDefinition = {
    id: "TASK_005",
    name: "GitHub Repository Navigation",
    description: "Navigate through GitHub to find specific repository information",
    category: "navigation",
    instruction: `Go to GitHub and:
1. Search for the repository "facebook/react"
2. Navigate to the Issues tab
3. Filter to show only open issues with the label "good first issue"
4. Sort by most recently updated
5. Report the title of the first issue in the list`,
    startingUrl: "https://github.com",
    structuredInputs: {
        repository: "facebook/react",
        tab: "issues",
        state: "open",
        label: "good first issue",
        sort: "recently-updated",
    },
    successCriteria: {
        urlContains: "facebook/react/issues",
        urlPattern: /label.*good.*first/i,
    },
    subGoals: [
        {
            id: "sg_search",
            name: "Repository Searched",
            description: "Searched for facebook/react",
            weight: 0.15,
            verification: { type: "url", urlContains: "search" },
        },
        {
            id: "sg_repo_found",
            name: "Repository Found",
            description: "Navigated to the react repository",
            weight: 0.20,
            verification: { type: "url", urlContains: "facebook/react" },
        },
        {
            id: "sg_issues_tab",
            name: "Issues Tab Opened",
            description: "Clicked on the Issues tab",
            weight: 0.20,
            verification: { type: "url", urlContains: "/issues" },
        },
        {
            id: "sg_label_filter",
            name: "Label Filter Applied",
            description: "Filtered by good first issue label",
            weight: 0.20,
            verification: { type: "url", urlContains: "good+first+issue" },
        },
        {
            id: "sg_sorted",
            name: "Sorted by Recent",
            description: "Sorted issues by recently updated",
            weight: 0.15,
            verification: { type: "url", urlContains: "sort" },
        },
        {
            id: "sg_issue_found",
            name: "First Issue Identified",
            description: "Identified the first issue in the list",
            weight: 0.10,
            verification: { type: "dom", domCheck: { selector: ".issue-list-item", exists: true } },
        },
    ],
    limits: {
        maxActions: 20,
        maxTimeSeconds: 180,
        maxLLMCalls: 15,
    },
};

// ============================================
// SAMPLE EVAL SUITE
// ============================================

export const sampleEvalSuite: EvalSuite = {
    id: "suite_browser_agent_v1",
    name: "Browser Agent Evaluation Suite v1",
    description: "A comprehensive evaluation suite for testing browser agents across various task types",
    version: "1.0.0",
    tasks: [
        flightSearchTask,
        productSearchTask,
        formFillingTask,
        dataExtractionTask,
        multiStepNavigationTask,
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
};

// ============================================
// TASK REGISTRY
// ============================================

const taskRegistry = new Map<string, TaskDefinition>();

// Register default tasks
taskRegistry.set(flightSearchTask.id, flightSearchTask);
taskRegistry.set(productSearchTask.id, productSearchTask);
taskRegistry.set(formFillingTask.id, formFillingTask);
taskRegistry.set(dataExtractionTask.id, dataExtractionTask);
taskRegistry.set(multiStepNavigationTask.id, multiStepNavigationTask);

export function registerTask(task: TaskDefinition): void {
    taskRegistry.set(task.id, task);
}

export function getTask(id: string): TaskDefinition | undefined {
    return taskRegistry.get(id);
}

export function getAllTasks(): TaskDefinition[] {
    return Array.from(taskRegistry.values());
}

export function getTasksByCategory(category: TaskDefinition["category"]): TaskDefinition[] {
    return getAllTasks().filter((task) => task.category === category);
}
