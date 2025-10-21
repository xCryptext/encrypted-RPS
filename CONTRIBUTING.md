# Contributing to Rock Paper Scissors FHE Game

Thank you for your interest in contributing to our FHE-powered Rock Paper Scissors game! This document provides guidelines for contributing to the project.

## 🎯 How to Contribute

### Reporting Issues
- Use GitHub Issues to report bugs or request features
- Provide detailed information about the issue
- Include steps to reproduce if it's a bug
- Add screenshots or error messages when relevant

### Suggesting Features
- Open a GitHub Issue with the "enhancement" label
- Describe the feature and its benefits
- Consider the impact on FHE operations and gas costs

### Code Contributions
- Fork the repository
- Create a feature branch from `main`
- Make your changes
- Add tests for new functionality
- Ensure all tests pass
- Submit a pull request

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git
- MetaMask wallet
- Sepolia ETH for testing

### Local Development
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/encrypted-games-fhe.git
cd encrypted-games-fhe

# Install frontend dependencies
npm install

# Install Hardhat dependencies
cd hardhat
npm install
cd ..

# Start development server
npm run dev

# Run smart contract tests
npm test

# Run only smart contract tests
npm run test:contracts
```

## 📝 Coding Standards

### Solidity
- Follow Solidity style guide
- Use meaningful variable names
- Add NatSpec documentation
- Include security considerations

### JavaScript/React
- Use ESLint configuration
- Follow React best practices
- Add PropTypes for components
- Include JSDoc comments

### FHE Operations
- Always validate encrypted inputs
- Handle decryption errors gracefully
- Use appropriate data types (euint8, ebool)
- Test with various input combinations

## 🧪 Testing Guidelines

#### Smart Contract Tests
- **Unit Tests**: Test all contract functions
- **Integration Tests**: Test complete game scenarios
- **FHE Tests**: Test encrypted operations
- **Gas Tests**: Validate gas usage optimization
- **Security Tests**: Test for vulnerabilities

#### Test Commands
```bash
# Run smart contract tests
npm test

# Run with coverage
npm run hardhat:coverage
```

#### Test Structure
```
hardhat/test/
└── RockPaperScissorsGameFHEonly.test.ts  # Complete contract tests
```

## 🔒 Security Considerations

### Smart Contract Security
- Never use `tx.origin` for authorization
- Validate all inputs
- Use OpenZeppelin security patterns
- Consider reentrancy attacks

### FHE Security
- Validate encrypted inputs
- Verify oracle signatures
- Handle decryption failures
- Protect against replay attacks

## 📋 Pull Request Process

### Before Submitting
1. Ensure all tests pass
2. Update documentation if needed
3. Add tests for new features
4. Check for security vulnerabilities
5. Verify FHE operations work correctly

### PR Description
- Describe what changes were made
- Explain why the changes were necessary
- Reference any related issues
- Include screenshots for UI changes

### Review Process
- All PRs require review
- Address feedback promptly
- Keep PRs focused and small
- Update documentation as needed

## 🎨 UI/UX Guidelines

### Design Principles
- Keep it simple and intuitive
- Ensure mobile responsiveness
- Use consistent styling
- Provide clear feedback

### FHE-Specific UI
- Show encryption/decryption status
- Display loading states during FHE operations
- Provide clear error messages
- Guide users through the process

## 📚 Documentation

### Code Documentation
- Add JSDoc comments for functions
- Include NatSpec for Solidity
- Document FHE operations
- Explain complex algorithms

### User Documentation
- Update README for new features
- Add usage examples
- Document configuration options
- Include troubleshooting guides

## 🐛 Bug Reports

### Required Information
- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Error messages or logs

### Bug Report Template
```markdown
## Bug Description
Brief description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior
What you expected to happen

## Actual Behavior
What actually happened

## Environment
- OS: [e.g. Windows 10]
- Browser: [e.g. Chrome 91]
- Node.js version: [e.g. 18.0.0]
- Contract address: [e.g. 0x...]

## Additional Context
Any other context about the problem
```

## 💡 Feature Requests

### Feature Request Template
```markdown
## Feature Description
Brief description of the feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How should this be implemented?

## Alternatives Considered
What other solutions were considered?

## Additional Context
Any other context about the feature request
```

## 🤝 Community Guidelines

### Code of Conduct
- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the golden rule

### Communication
- Use clear and concise language
- Be patient with newcomers
- Ask questions when unsure
- Share knowledge and resources

## 📞 Getting Help

### Resources
- GitHub Issues for bug reports
- GitHub Discussions for questions
- Discord for real-time chat
- Documentation for reference

### Contact
- Discord: [Zama Developer Program](https://discord.gg/zama)
- Email: 0xcryptext@gmail.com
- GitHub: [xCryptext](https://github.com/xCryptext)

## 🏆 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project documentation
- Community highlights

Thank you for contributing to the future of private blockchain gaming! 🚀
