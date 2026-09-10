%Ruels
% Basic arithmetic rules
add(A, B, X) :- X is A + B.
subtract(A, B, X) :- X is A - B.
multiply(A, B, X) :- X is A * B.
divide(A, B, X) :- X is A / B.
 
% Compound expressions 
calc_without_parens(A, B, C, X) :- X is A + B * C.
calc_with_parens(A, B, C, X) :- X is (A + B) * C.