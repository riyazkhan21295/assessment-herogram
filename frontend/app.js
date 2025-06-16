// Import API service
import ensureAPI, {
    createTitle,
    deleteReference,
    generateThumbnails as generatePaintings,
    getGlobalReferences,
    getThumbnails as getPaintings,
    getReferences,
    getTitle,
    getTitles,
    login,
    register,
    retryPainting as retryPaintingAPI,
    updateTitle,
    uploadReference
} from "./apiService.js";

let api = null;
let currentTitle = null;
let titles = [];

// Initialize API
(async () => {
    api = await ensureAPI();
})();

// Simulated Server API
const ServerAPI = {
    // Simulated server data storage (In a real app, this would be on the server)
    _data: {
        titles: [],
        globalReferences: [],
    },

    // Get data from server
    async getTitles() {
        // Simulate network delay
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([...this._data.titles]);
            }, 300);
        });
    },

    async getGlobalReferences() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([...this._data.globalReferences]);
            }, 300);
        });
    },

    // Save data to server
    async saveTitles(titles) {
        return new Promise((resolve) => {
            setTimeout(() => {
                this._data.titles = [...titles];
                resolve({ success: true });
            }, 300);
        });
    },

    async saveGlobalReferences(references) {
        return new Promise((resolve) => {
            setTimeout(() => {
                this._data.globalReferences = [...references];
                resolve({ success: true });
            }, 300);
        });
    },

    // Get a specific title by id
    async getTitleById(id) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const title = this._data.titles.find((t) => t.id === id);
                resolve(title || null);
            }, 200);
        });
    },

    // Generate thumbnails (simulate AI processing)
    async generateThumbnails(titleObj, references, quantity, startIndex = 0) {
        // First generate all concepts sequentially
        const concepts = [];

        return new Promise((resolve) => {
            // Generate concepts sequentially first - this is the first AI's job
            const generateConcepts = async () => {
                for (let i = 0; i < quantity; i++) {
                    // Simulate concept generation for each thumbnail
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    const concept = {
                        id: generateID(),
                        index: startIndex + i,
                        title: titleObj.title,
                        instructions: titleObj.instructions,
                        summary: generatePromptSummary(
                            titleObj.title,
                            titleObj.instructions
                        ),
                        fullPrompt: generateFullPrompt(
                            titleObj.title,
                            titleObj.instructions,
                            startIndex + i
                        ),
                    };

                    concepts.push(concept);
                }

                // After all concepts are generated, start parallel image generation
                processThumbnailsInParallel(concepts, references);
            };

            // Process thumbnails in parallel, 5 at a time
            const processThumbnailsInParallel = async (concepts, references) => {
                const thumbnails = [];
                const maxConcurrent = 5;
                let completedCount = 0;
                let activeCount = 0;
                let nextIndex = 0;

                // Function to process a single thumbnail
                const processThumbnail = async (concept) => {
                    activeCount++;

                    // Simulate varying processing times (1-3 seconds)
                    const processingTime = 1000 + Math.random() * 2000;
                    await new Promise((resolve) => setTimeout(resolve, processingTime));

                    const thumbnailData = {
                        id: concept.id,
                        image_url: `https://placehold.co/600x400/3498db/ffffff?text=Thumbnail+${concept.index + 1
                            }`,
                        summary: concept.summary,
                        promptDetails: {
                            summary: concept.summary,
                            title: concept.title,
                            instructions:
                                concept.instructions || "No custom instructions provided",
                            referenceCount: references.length,
                            referenceImages: references.map((ref) => ref.data),
                            fullPrompt: concept.fullPrompt,
                        },
                        status: "completed",
                        index: concept.index,
                    };

                    thumbnails.push(thumbnailData);
                    completedCount++;
                    activeCount--;

                    // Signal that this thumbnail is ready
                    if (thumbnailReady) {
                        thumbnailReady(thumbnailData);
                    }

                    // Start another one if there are more to process
                    if (nextIndex < concepts.length) {
                        processThumbnail(concepts[nextIndex++]);
                    }

                    // If all thumbnails are complete, resolve the main promise
                    if (completedCount === concepts.length) {
                        // Sort thumbnails by original index
                        thumbnails.sort((a, b) => a.index - b.index);
                        resolve(thumbnails);
                    }
                };

                // Start initial batch of thumbnails
                const initialBatch = Math.min(maxConcurrent, concepts.length);
                for (let i = 0; i < initialBatch; i++) {
                    processThumbnail(concepts[nextIndex++]);
                }
            };

            // Start the process
            generateConcepts();
        });
    },

    // Regenerate a single thumbnail
    async regenerateThumbnail(titleObj, references, index) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const summaryText = generatePromptSummary(
                    titleObj.title,
                    titleObj.instructions
                );

                const thumbnailData = {
                    id: generateID(),
                    image_url: `https://placehold.co/600x400/e74c3c/ffffff?text=Regenerated+${index + 1
                        }`,
                    summary: `Regenerated concept ${index + 1} for "${titleObj.title}"`,
                    promptDetails: {
                        summary: summaryText,
                        title: titleObj.title,
                        instructions:
                            titleObj.instructions || "No custom instructions provided",
                        referenceCount: references.length,
                        referenceImages: references.map((ref) => ref.data),
                        fullPrompt: generateFullPrompt(
                            titleObj.title,
                            titleObj.instructions,
                            index
                        ),
                    },
                };

                resolve(thumbnailData);
            }, 2000);
        });
    },
};

// Data Storage (will now communicate with the backend)
let globalReferences = [];
let currentReferenceDataMap = {}; // New: To store reference image data for the current view
let isLoading = true;
let currentUser = null;

// DOM Elements
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const showRegisterLink = document.getElementById("show-register");
const showLoginLink = document.getElementById("show-login");
const usernameDisplay = document.getElementById("username-display");
const titleList = document.getElementById("title-list");
const titleInput = document.getElementById("title-input");
const customInstructions = document.getElementById("custom-instructions");
const quantitySelect = document.getElementById("quantity-select");
const generateBtn = document.getElementById("generate-btn");
const moreThumbnailsBtn = document.getElementById("more-thumbnails-btn");
const moreThumbnailsSection = document.getElementById("more-thumbnails-section");
const thumbnailsGrid = document.getElementById("thumbnails-grid");
const thumbnailsEmptyState = document.getElementById("thumbnails-empty-state");
const progressSection = document.getElementById("progress-section");
const ai1Progress = document.getElementById("ai1-progress");
const ai2Progress = document.getElementById("ai2-progress");
const ai1Status = document.getElementById("ai1-status");
const ai2Status = document.getElementById("ai2-status");
const newTitleBtn = document.getElementById("new-title-btn");
const globalReferenceToggle = document.getElementById("global-reference-toggle");
const globalReferencesSection = document.getElementById("global-references");
const titleReferencesSection = document.getElementById("title-references");
const globalDropzone = document.getElementById("global-dropzone");
const titleDropzone = document.getElementById("title-dropzone");
const globalFileInput = document.getElementById("global-file-input");
const titleFileInput = document.getElementById("title-file-input");
const globalUploadBtn = document.getElementById("global-upload-btn");
const titleUploadBtn = document.getElementById("title-upload-btn");
const globalReferenceImages = document.getElementById("global-reference-images");
const titleReferenceImages = document.getElementById("title-reference-images");
const promptModal = document.getElementById("prompt-modal");
const closeModal = document.querySelector(".close-modal");
const modalImage = document.getElementById("modal-image");
const modalTitle = document.getElementById("modal-title");
const promptSummary = document.getElementById("prompt-summary");
const promptTitle = document.getElementById("prompt-title");
const promptInstructions = document.getElementById("prompt-instructions");
const referenceCount = document.getElementById("reference-count");
const referenceThumbnails = document.getElementById("reference-thumbnails");
const fullPrompt = document.getElementById("full-prompt");
const loadingOverlay = document.getElementById("loading-overlay");

// Callback to handle when a thumbnail is ready
let thumbnailReady = null;

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded, initializing application...");
    setupEventListeners();

    // Check if user is already logged in
    const token = localStorage.getItem("token");
    if (token) {
        loadUserData();
    } else {
        showLoginForm();
    }
});

// Show/hide loading indicator
function showLoading(show) {
    console.log("Loading indicator:", show ? "SHOWING" : "HIDING");
    isLoading = show;

    // Show/hide the loading overlay
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
        overlay.style.display = show ? "flex" : "none";
    } else {
        console.error("Loading overlay element not found!");
    }

    // Disable buttons while loading
    const buttons = document.querySelectorAll("button");
    buttons.forEach((button) => {
        button.disabled = show;
    });
}

// Load user data from server
async function loadUserData() {
    try {
        // Fetch titles
        console.log("LUD: Fetching titles...");
        const titlesResponse = await getTitles();
        titles = titlesResponse.data.titles;
        console.log("LUD: Titles fetched:", titles ? titles.length : 0);

        // Fetch global references
        console.log("LUD: Fetching global references...");
        const referencesResponse = await getGlobalReferences();
        console.log("LUD: Global references API response:", referencesResponse);
        globalReferences = referencesResponse.data.references;
        console.log("LUD: Stored global references:", globalReferences);

        // Render UI
        console.log("LUD: Rendering titles list...");
        renderTitlesList();
        console.log("LUD: Rendering global reference images...");
        renderReferenceImages(globalReferences, globalReferenceImages);
        console.log("LUD: Global reference images rendered.");

        // Show main app container and hide login/register forms
        document.getElementById("login-container").style.display = "none";
        document.getElementById("app-container").style.display = "flex";

        // If titles are loaded, start polling for the first one for demonstration
        // if (titles && titles.length > 0) {
        //     const firstTitleId = titles[0].id;
        //     const defaultQuantity = 5;
        //     console.log(
        //         `LUD: Automatically starting polling for title ID: ${firstTitleId}, quantity: ${defaultQuantity}`
        //     );
        //     pollThumbnailStatus(firstTitleId, defaultQuantity);
        // } else {
        //     console.log("LUD: No titles found, not starting auto-polling.");
        // }
        console.log("LUD: User data loading complete.");
    } catch (error) {
        console.error("Error loading user data (LUD):", error);
        if (error.response) {
            console.error(
                "LUD: Server error response:",
                error.response.status,
                error.response.data
            );
        }
        alert("Failed to load data. Please try again.");
    }
}

// Show login form
function showLoginForm() {
    document.getElementById("app-container").style.display = "none";
    document.getElementById("login-container").style.display = "block";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "block";
}

// Handle login
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
        const response = await login(email, password);
        await handleLoginSuccess(response);
    } catch (error) {
        console.error("Login error:", error);
        alert(error.response?.data?.error || "Login failed. Please try again.");
    }
}

// Handle register
async function handleRegister(event) {
    event.preventDefault();
    console.log("Register form submitted");

    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;

    console.log("Form values:", { username, email, password });

    if (!username || !email || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {
        showLoading(true);
        console.log("Sending register request...", { username, email });
        const response = await register(username, email, password);
        console.log("Register response:", response.data);
        localStorage.setItem("token", response.data.token);
        currentUser = response.data.user;

        // Set username in the UI
        document.getElementById("username-display").textContent =
            currentUser.username;

        await loadUserData();
    } catch (error) {
        console.error("Registration error:", error);
        if (error.response && error.response.data) {
            alert(
                error.response.data.error || "Registration failed. Please try again."
            );
        } else {
            alert(
                "Registration failed. Please check your network connection and try again."
            );
        }
    } finally {
        showLoading(false);
    }
}

// Logout function
function logout() {
    // Clear authentication
    localStorage.removeItem("token");

    // Clear all states
    currentUser = null;
    titles = [];
    globalReferences = [];
    currentTitle = null;

    // Stop any active polling
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
        currentPollingTitleId = null;
    }

    // Clear all inputs
    document.getElementById("title-input").value = "";
    document.getElementById("instructions-input").value = "";
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
    document.getElementById("register-username").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";

    // Clear reference images
    document.getElementById("global-reference-images").innerHTML = "";
    document.getElementById("title-reference-images").innerHTML = "";

    // Clear thumbnails grid
    document.getElementById("thumbnails-grid").innerHTML = `
        <div class="empty-state" id="thumbnails-empty-state">No paintings generated yet.</div>
    `;

    // Hide more thumbnails section
    document.getElementById("more-thumbnails-section").style.display = "none";

    // Clear title list
    document.getElementById("title-list").innerHTML = `
        <div class="empty-state">No titles yet. Create your first one!</div>
    `;

    // Close any open modal
    const modal = document.getElementById("prompt-modal");
    if (modal.style.display === "block") {
        modal.style.display = "none";
    }

    // Show login form
    showLoginForm();
}

// Event Listeners
function setupEventListeners() {
    console.log("Setting up event listeners...");

    // Login/Register form event listeners
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const showRegisterLink = document.getElementById("show-register");
    const showLoginLink = document.getElementById("show-login");

    console.log("Form elements:", {
        loginForm: loginForm ? "found" : "not found",
        registerForm: registerForm ? "found" : "not found",
        showRegisterLink: showRegisterLink ? "found" : "not found",
        showLoginLink: showLoginLink ? "found" : "not found",
    });

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener("submit", handleRegister);
    }

    // Show/Hide register form
    if (showRegisterLink) {
        showRegisterLink.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("Show register link clicked");
            if (loginForm) loginForm.style.display = "none";
            if (registerForm) registerForm.style.display = "block";
        });
    }

    // Show/Hide login form
    if (showLoginLink) {
        showLoginLink.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("Show login link clicked");
            if (registerForm) registerForm.style.display = "none";
            if (loginForm) loginForm.style.display = "block";
        });
    }

    // New Title Button
    newTitleBtn.addEventListener("click", () => {
        clearMainContent();
        titleInput.focus();
    });

    // Generate Button
    generateBtn.addEventListener("click", async () => {
        const title = titleInput.value.trim();
        if (!title) {
            alert("Please enter a title");
            return;
        }

        try {
            const instructions = customInstructions.value.trim();
            const quantity = parseInt(quantitySelect.value) || 3;

            // Create or update title
            let titleResponse;
            if (!currentTitle || currentTitle.title !== title) {
                // Create new title
                console.log("Creating new title");
                titleResponse = await createTitle(title, instructions);
                currentTitle = titleResponse.data;
            } else {
                // Update existing title
                console.log("Updating existing title:", currentTitle.id);
                titleResponse = await updateTitle(currentTitle.id, title, instructions);
                currentTitle = titleResponse.data;
            }

            // Upload any new title-specific references
            if (!globalReferenceToggle.checked && currentTitle.references) {
                console.log("Processing title-specific references");
                for (const ref of currentTitle.references) {
                    if (!ref.id) {
                        // New reference that hasn't been uploaded
                        console.log("Uploading new reference");
                        await uploadReference(currentTitle.id, ref.data, false);
                    }
                }
            }

            // Create placeholders for paintings
            const generateResponse = await generateServerThumbnails(
                currentTitle,
                currentTitle.references || [],
                quantity
            );

            console.log("Refreshing titles list");
            getTitles().then(response => {
                titles = response.data.titles;
                renderTitlesList();
            });

            // Load thumbnails to show placeholders
            await loadThumbnails(currentTitle.id);

            // Start polling for the new thumbnails
            pollPaintingStatus(currentTitle.id);

        } catch (error) {
            console.error("Error generating paintings:", error);
            alert("Failed to generate paintings. Please try again.");
        }
    });

    // More Thumbnails Button
    moreThumbnailsBtn.addEventListener("click", async () => {
        if (!currentTitle) return;

        try {
            const quantity = parseInt(quantitySelect.value) || 3;

            // Create placeholders for additional paintings first
            await generateServerThumbnails(
                currentTitle,
                currentTitle.references || [],
                quantity,
                true
            );

            // Load thumbnails to show placeholders
            await loadThumbnails(currentTitle.id);

            // Start polling for the new thumbnails (pollPaintingStatus will handle duplicate polling)
            pollPaintingStatus(currentTitle.id);
        } catch (error) {
            console.error("Error generating more paintings:", error);
            alert("Failed to generate additional paintings. Please try again.");
        }
    });

    // Toggle reference type
    globalReferenceToggle.addEventListener("change", () => {
        const useGlobalRefs = globalReferenceToggle.checked;
        globalReferencesSection.style.display = useGlobalRefs ? "block" : "none";
        titleReferencesSection.style.display = useGlobalRefs ? "none" : "block";

        if (!useGlobalRefs && currentTitle) {
            renderReferenceImages(currentTitle.references, titleReferenceImages);
        }
    });

    // Global upload button
    globalUploadBtn.addEventListener("click", () => {
        globalFileInput.click();
    });

    // Title-specific upload button
    titleUploadBtn.addEventListener("click", () => {
        titleFileInput.click();
    });

    // Global file input change
    globalFileInput.addEventListener("change", (e) => {
        handleFileUpload(e, globalReferences, globalReferenceImages, true);
    });

    // Title-specific file input change
    titleFileInput.addEventListener("change", (e) => {
        if (!currentTitle) {
            alert("Please enter a title first");
            return;
        }
        handleFileUpload(e, currentTitle.references, titleReferenceImages, false);
    });

    // Drag and drop events for dropzones
    setupDragAndDrop(
        globalDropzone,
        globalReferences,
        globalReferenceImages,
        true
    );
    setupDragAndDrop(
        titleDropzone,
        currentTitle?.references || [],
        titleReferenceImages,
        false
    );

    // Modal close button
    closeModal.addEventListener("click", closePromptModal);

    // Close modal when clicking outside
    window.addEventListener("click", (e) => {
        if (e.target === promptModal) {
            closePromptModal();
        }
    });

    // Close modal with Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && promptModal.style.display === "block") {
            closePromptModal();
        }
    });

    // Logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", logout);
    }
}

// Setup drag and drop functionality
function setupDragAndDrop(dropzone, referencesArray, displayElement, isGlobal) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ["dragenter", "dragover"].forEach((eventName) => {
        dropzone.addEventListener(
            eventName,
            () => {
                dropzone.classList.add("dragover");
            },
            false
        );
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dropzone.addEventListener(
            eventName,
            () => {
                dropzone.classList.remove("dragover");
            },
            false
        );
    });

    dropzone.addEventListener(
        "drop",
        (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (!isGlobal && !currentTitle) {
                alert("Please enter a title first");
                return;
            }

            handleFiles(files, referencesArray, displayElement, isGlobal);
        },
        false
    );
}

// Handle file uploads from input or drag-and-drop
function handleFileUpload(event, referencesArray, displayElement, isGlobal) {
    const files = event.target.files;
    handleFiles(files, referencesArray, displayElement, isGlobal);
    event.target.value = ""; // Reset the input
}

// Process uploaded files
async function handleFiles(files, referencesArray, displayElement, isGlobal) {
    if (!files.length) return;

    for (const file of files) {
        if (!file.type.match("image.*")) {
            alert("Please upload only image files");
            continue;
        }

        try {
            // Read file as data URL
            const imageData = await readFileAsDataURL(file);

            if (isGlobal) {
                // Upload global reference to server
                const response = await uploadReference(null, imageData, true);
                globalReferences.push({
                    id: response.data.id,
                    data: imageData,
                });
            } else {
                if (!currentTitle.references) {
                    currentTitle.references = [];
                }

                if (currentTitle.id) {
                    // Upload title-specific reference to server
                    const response = await uploadReference(
                        currentTitle.id,
                        imageData,
                        false
                    );
                    currentTitle.references.push({
                        id: response.data.id,
                        data: imageData,
                    });
                } else {
                    // Store locally until title is created
                    currentTitle.references.push({
                        data: imageData,
                    });
                }
            }

            renderReferenceImages(
                isGlobal ? globalReferences : currentTitle.references,
                displayElement
            );
        } catch (error) {
            console.error("Error processing file:", error);
            alert("Failed to process reference image. Please try again.");
        }
    }
}

// Promise-based file reader
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// Render reference images
function renderReferenceImages(references, container) {
    container.innerHTML = "";

    if (!references || !Array.isArray(references) || references.length === 0) {
        container.innerHTML =
            '<p class="empty-state">No reference images uploaded</p>';
        return;
    }

    references.forEach((ref) => {
        // Use ref.image_data if ref.data is not present (for data loaded from backend)
        // Use ref.data if present (for freshly uploaded images not yet saved/reloaded)
        const imageDataString = ref.image_data || ref.data;

        if (!ref || !imageDataString) {
            console.warn("Invalid reference found or missing image data:", ref);
            return; // Skip this reference
        }

        const imgContainer = document.createElement("div");
        imgContainer.className = "reference-image";

        const img = document.createElement("img");
        img.src = imageDataString;
        img.alt = "Reference Image";
        img.onerror = () => {
            console.warn("Failed to load reference image:", ref.id);
            img.src =
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"%3E%3Cpath fill="%23ccc" d="M21.9 21.9l-8.49-8.49-9.93-9.93L2.1 2.1 .69 3.51 3 5.83V19c0 1.1 .9 2 2 2h13.17l2.31 2.31 1.42-1.41zM5 18l3.5-4.5 2.5 3.01L12.17 15l3 3H5zm16 .17L5.83 3H19c1.1 0 2 .9 2 2v13.17z"/%3E%3C/svg%3E';
            img.alt = "Broken Image";
        };

        const removeBtn = document.createElement("div");
        removeBtn.className = "remove-image";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => {
            // Ensure ref.id exists. If it was a freshly added client-side only ref without an ID,
            // this might need a different way to remove it (e.g., by index or object equality).
            if (ref.id) {
                removeReferenceImage(ref.id, references, container);
            } else {
                // Fallback for locally added items without an ID yet (if any)
                const indexToRemove = references.indexOf(ref);
                if (indexToRemove > -1) {
                    references.splice(indexToRemove, 1);
                    renderReferenceImages(references, container); // Re-render
                }
                console.warn("Attempted to remove reference without an ID", ref);
            }
        });

        imgContainer.appendChild(img);
        imgContainer.appendChild(removeBtn);
        container.appendChild(imgContainer);
    });
}

// Remove a reference image
async function removeReferenceImage(id, references, container) {
    try {
        // Delete from server
        await deleteReference(id);

        // Remove from local array
        const index = references.findIndex((ref) => ref.id === id);
        if (index !== -1) {
            references.splice(index, 1);
            renderReferenceImages(references, container);
        }
    } catch (error) {
        console.error("Error removing reference image:", error);
        alert("Failed to delete reference image. Please try again.");
    }
}

// Poll for painting status updates
let statusPollingInterval;
let currentPollingTitleId;

async function pollPaintingStatus(titleId) {
    // If already polling for this title, don't start another instance
    if (statusPollingInterval && currentPollingTitleId === titleId) {
        console.log(`Already polling for title ${titleId}, skipping new poll request`);
        return;
    }

    // Clear any existing polling for different title
    if (statusPollingInterval) {
        console.log(`Stopping polling for previous title ${currentPollingTitleId}`);
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
    }

    currentPollingTitleId = titleId;
    console.log(`Starting polling for title ${titleId}`);

    const updatePaintingStatus = async () => {
        try {
            const response = await getPaintings(titleId);
            const paintings = response.data.paintings;

            // Update each painting's status in the UI
            paintings.forEach(painting => {
                const container = document.getElementById(`thumb-${titleId}-${painting.generation_order}`);
                if (!container) return;

                if (painting.status === 'completed' && painting.image_url) {
                    // Replace loading thumbnail with completed painting
                    container.innerHTML = '';
                    const img = document.createElement('img');
                    img.src = painting.image_url;
                    img.alt = `Painting ${painting.generation_order}`;
                    img.className = 'thumbnail-image';
                    container.appendChild(img);
                    container.onclick = () => showPromptDetails(painting, response.data.referenceDataMap);
                } else {
                    // Update loading thumbnail status
                    const loadingThumb = container.querySelector('.loading-thumbnail');
                    if (loadingThumb) {
                        switch (painting.status) {
                            case 'pending':
                                loadingThumb.innerHTML = '<div class="spinner"></div><div class="status">Pending...</div>';
                                break;
                            case 'processing':
                                loadingThumb.innerHTML = '<div class="spinner"></div><div class="status">Generating...</div>';
                                break;
                            case 'failed':
                                loadingThumb.innerHTML = `
                                    <div class="error-icon">❌</div>
                                    <div class="status">Failed: ${painting.error_message || 'Unknown error'}</div>
                                    <button class="retry-btn" onclick="retryPainting(${titleId}, ${painting.generation_order})">Retry</button>
                                `;
                                break;
                        }
                    }
                }
            });

            // Check if we should stop polling
            const hasInProgress = paintings.some(p => p.status === 'pending' || p.status === 'processing');
            if (!hasInProgress) {
                console.log(`No in-progress paintings for title ${titleId}, stopping polling`);
                clearInterval(statusPollingInterval);
                statusPollingInterval = null;
                currentPollingTitleId = null;
            }

        } catch (error) {
            console.error("Error polling painting status:", error);
            clearInterval(statusPollingInterval);
            statusPollingInterval = null;
            currentPollingTitleId = null;
        }
    };

    // Initial update
    await updatePaintingStatus();

    // Start polling every 2 seconds if not already polling
    if (!statusPollingInterval) {
        statusPollingInterval = setInterval(updatePaintingStatus, 2000);
    }
}

// Make retryPainting globally accessible
window.retryPainting = retryPainting;

// Retry a failed painting
async function retryPainting(titleId, order) {
    try {
        // Reset the painting status to pending
        const container = document.getElementById(`thumb-${titleId}-${order}`);
        if (container) {
            const loadingThumb = container.querySelector('.loading-thumbnail');
            if (loadingThumb) {
                loadingThumb.innerHTML = '<div class="spinner"></div><div class="status">Retrying...</div>';
            }
        }

        // Call API to retry the painting
        await retryPaintingAPI(titleId, order);

        // Start polling if not already polling
        pollPaintingStatus(titleId);

    } catch (error) {
        console.error("Error retrying painting:", error);
        alert("Failed to retry painting. Please try again.");
    }
}

// Load thumbnails for a title
async function loadThumbnails(titleId) {
    try {
        console.log(`Fetching thumbnails for title ${titleId}...`);
        const response = await getPaintings(titleId);

        // Clear existing thumbnails
        thumbnailsGrid.innerHTML = "";
        thumbnailsEmptyState.style.display = "none";

        const paintings = response.data.paintings;
        if (!paintings || paintings.length === 0) {
            thumbnailsEmptyState.style.display = "block";
            moreThumbnailsSection.style.display = "none";
            return;
        }

        // Show the "Generate More" button if there are paintings
        moreThumbnailsSection.style.display = "block";

        // Display all paintings in order
        paintings.forEach(painting => {
            const thumbContainer = document.createElement("div");
            thumbContainer.className = "thumbnail-item";
            thumbContainer.id = `thumb-${titleId}-${painting.generation_order}`;
            thumbContainer.dataset.order = painting.generation_order;

            if (painting.status === 'completed' && painting.image_url) {
                const img = document.createElement("img");
                img.src = painting.image_url;
                img.alt = painting.summary;
                img.className = "thumbnail-image";
                thumbContainer.appendChild(img);
                thumbContainer.onclick = () => showPromptDetails(painting, response.data.referenceDataMap);
            } else {
                const loadingThumb = document.createElement("div");
                loadingThumb.className = "loading-thumbnail";

                switch (painting.status) {
                    case 'pending':
                        loadingThumb.innerHTML = '<div class="spinner"></div><div class="status">Pending...</div>';
                        break;
                    case 'processing':
                        loadingThumb.innerHTML = '<div class="spinner"></div><div class="status">Generating...</div>';
                        break;
                    case 'failed':
                        loadingThumb.innerHTML = `
                            <div class="error-icon">❌</div>
                            <div class="status">Failed: ${painting.error_message || 'Unknown error'}</div>
                            <button class="retry-btn" onclick="retryPainting(${titleId}, ${painting.generation_order})">Retry</button>
                        `;
                        break;
                }
                thumbContainer.appendChild(loadingThumb);
            }

            thumbnailsGrid.appendChild(thumbContainer);
        });

        // Start polling if there are any pending or processing paintings
        const inProgressCount = paintings.filter(p => p.status === 'pending' || p.status === 'processing').length;
        if (inProgressCount > 0) {
            console.log(`Found ${inProgressCount} in-progress thumbnails, starting polling...`);
            pollPaintingStatus(titleId);
        }

        return paintings;
    } catch (error) {
        console.error("Error loading thumbnails:", error);
        alert("Failed to load paintings. Please try again.");
    }
}

// Render the list of titles in the sidebar
function renderTitlesList() {
    titleList.innerHTML = "";

    if (titles.length === 0) {
        titleList.innerHTML =
            '<div class="empty-state">No titles yet. Create your first one!</div>';
        return;
    }

    // Sort titles by timestamp/created_at (newest first)
    titles.sort((a, b) => {
        const timeA = a.timestamp || new Date(a.created_at).getTime();
        const timeB = b.timestamp || new Date(b.created_at).getTime();
        return timeB - timeA;
    });

    titles.forEach((title) => {
        const titleItem = document.createElement("div");
        titleItem.className = "title-item";
        titleItem.dataset.id = title.id; // Store ID as data attribute

        // Set active class if this is the current title
        if (currentTitle && currentTitle.id === title.id) {
            titleItem.classList.add("active");
        }

        titleItem.textContent = title.title;
        titleItem.addEventListener("click", () => {
            // Remove active class from all titles
            document.querySelectorAll('.title-item').forEach(item => {
                item.classList.remove('active');
            });

            // Add active class to clicked title
            titleItem.classList.add('active');

            // Load the title
            loadTitle(title);
        });

        titleList.appendChild(titleItem);
    });
}

// Load a title when clicked from the sidebar
async function loadTitle(titleItem) {
    try {
        const titleId = titleItem.id;
        console.log(`Starting to load title with ID: ${titleId}`);

        // Get the title details
        try {
            const titleResponse = await getTitle(titleId);
            currentTitle = titleResponse.data;
            console.log(`Successfully loaded title details:`, currentTitle);
        } catch (titleError) {
            console.error(
                `Error loading title details for ID ${titleId}:`,
                titleError
            );
            if (titleError.response) {
                console.error(
                    `Status: ${titleError.response.status}, Data:`,
                    titleError.response.data
                );
            }
            throw new Error(`Failed to load title details: ${titleError.message}`);
        }

        // Get title references
        try {
            const referencesResponse = await getReferences(titleId);
            currentTitle.references = referencesResponse.data.references;
            console.log(`Successfully loaded references:`, currentTitle.references);
        } catch (refError) {
            console.error(
                `Error loading references for title ID ${titleId}:`,
                refError
            );
            if (refError.response) {
                console.error(
                    `Status: ${refError.response.status}, Data:`,
                    refError.response.data
                );
            }
            throw new Error(`Failed to load title references: ${refError.message}`);
        }

        // Update the form values
        titleInput.value = currentTitle.title;
        customInstructions.value = currentTitle.instructions || "";

        // Update reference images
        if (currentTitle.references && currentTitle.references.length > 0) {
            globalReferenceToggle.checked = false;
            globalReferencesSection.style.display = "none";
            titleReferencesSection.style.display = "block";
            renderReferenceImages(currentTitle.references, titleReferenceImages);
        } else {
            globalReferenceToggle.checked = true;
            globalReferencesSection.style.display = "block";
            titleReferencesSection.style.display = "none";
        }

        // Load and display paintings
        await loadThumbnails(titleId);

        // Update active title in sidebar
        const titleItems = document.querySelectorAll('.title-item');
        titleItems.forEach(item => {
            if (item.dataset.id === String(currentTitle.id)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

    } catch (error) {
        console.error("Error loading title:", error);
        alert("Failed to load title. Please try again.");
    }
}

// Render saved thumbnails for a title
function renderSavedThumbnails(title) {
    thumbnailsGrid.innerHTML = "";

    if (
        !title ||
        !title.thumbnails ||
        !Array.isArray(title.thumbnails) ||
        title.thumbnails.length === 0
    ) {
        thumbnailsEmptyState.style.display = "block";
        return;
    }

    thumbnailsEmptyState.style.display = "none";

    // Filter out any invalid thumbnails
    const validThumbnails = title.thumbnails.filter(
        (thumbnail) => thumbnail && typeof thumbnail === "object" && thumbnail.id
    );

    if (validThumbnails.length === 0) {
        thumbnailsEmptyState.style.display = "block";
        return;
    }

    // Count in-progress thumbnails
    const inProgressCount = validThumbnails.filter(
        thumb => thumb.status === "pending" || thumb.status === "processing"
    ).length;

    validThumbnails.forEach((thumbnail, index) => {
        try {
            const thumbContainer = document.createElement("div");
            thumbContainer.className = "thumbnail-item";
            thumbContainer.id = `thumb-${index}`;
            thumbnailsGrid.appendChild(thumbContainer);

            renderThumbnail(thumbnail, index);
        } catch (error) {
            console.error(`Error rendering thumbnail at index ${index}:`, error);
        }
    });

    // If there are in-progress thumbnails, start polling
    if (inProgressCount > 0 && title.id) {
        console.log(`Found ${inProgressCount} in-progress thumbnails, resuming polling...`);
        pollPaintingStatus(title.id);
    }
}

// Clear main content for a new title
function clearMainContent() {
    currentTitle = null;
    titleInput.value = "";
    customInstructions.value = "";
    quantitySelect.value = "5";
    thumbnailsGrid.innerHTML = "";
    thumbnailsEmptyState.style.display = "block";
    moreThumbnailsSection.style.display = "none";

    // Update reference images sections
    globalReferenceToggle.checked = true;
    globalReferencesSection.style.display = "block";
    titleReferencesSection.style.display = "none";

    // Clear per-title references
    titleReferenceImages.innerHTML =
        '<p class="empty-state">No reference images uploaded</p>';

    // Update sidebar active state
    const titleItems = document.querySelectorAll(".title-item");
    titleItems.forEach((item) => {
        item.classList.remove("active");
    });
}

// Save data to server
async function saveData() {
    try {
        await ServerAPI.saveTitles(titles);
        return true;
    } catch (error) {
        console.error("Error saving data to server:", error);
        alert("Failed to save data to server. Please try again.");
        return false;
    }
}

// Generate unique ID
function generateID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Close the prompt details modal
function closePromptModal() {
    promptModal.style.display = "none";
    document.body.style.overflow = "auto";
}

// Update the login success handler
async function handleLoginSuccess(response) {
    localStorage.setItem("token", response.data.token);
    loadUserData();
}

// Show prompt details in modal
function showPromptDetails(painting, referenceDataMap) {
    const modal = document.getElementById('prompt-modal');
    const modalImage = document.getElementById('modal-image');
    const modalTitle = document.getElementById('modal-title');
    const promptSummary = document.getElementById('prompt-summary');
    const promptTitle = document.getElementById('prompt-title');
    const promptInstructions = document.getElementById('prompt-instructions');
    const referenceCount = document.getElementById('reference-count');
    const referenceThumbnails = document.getElementById('reference-thumbnails');
    const fullPrompt = document.getElementById('full-prompt');

    // Set modal content
    modalImage.src = painting.image_url;
    modalTitle.textContent = 'Painting Prompt Details';
    promptSummary.textContent = painting.summary || 'No summary available';
    promptTitle.textContent = painting.title_text || 'No title available';
    promptInstructions.textContent = painting.title_instructions || 'No instructions available';

    // Set reference count and thumbnails
    const usedReferenceIds = painting.used_reference_ids ? JSON.parse(painting.used_reference_ids) : [];
    referenceCount.textContent = usedReferenceIds.length;

    // Clear and populate reference thumbnails
    referenceThumbnails.innerHTML = '';
    usedReferenceIds.forEach(refId => {
        if (referenceDataMap[refId]) {
            const img = document.createElement('img');
            img.src = referenceDataMap[refId];
            img.alt = 'Reference Image';
            img.className = 'reference-thumbnail';
            referenceThumbnails.appendChild(img);
        }
    });

    // Set full prompt
    fullPrompt.textContent = painting.fullPrompt || 'No prompt available';

    // Show modal
    modal.style.display = 'block';
}

// Generate server thumbnails
async function generateServerThumbnails(titleObj, references, quantity, isAdditional = false) {
    try {
        console.log("generateServerThumbnails :: ", titleObj, references, quantity, isAdditional);

        // Call the API to generate paintings
        const generateResponse = await generatePaintings(titleObj.id, quantity);
        console.log("Generate paintings response:", generateResponse.data);

        // Return the response data
        return generateResponse.data;
    } catch (error) {
        console.error("Error in generateServerThumbnails:", error);
        throw error;
    }
}